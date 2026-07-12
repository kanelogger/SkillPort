import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { CliError, sanitizeError } from "../domain/errors.js";
import { isInside } from "./filesystem.js";

export type PreparedSource = {
  root: string;
  type: "local" | "git";
  location: string;
  ref: string | null;
  revision: string | null;
  cleanup: () => void;
};

type PrepareOptions = { ref?: string; gitPath?: string };
type GitSourceSpec = {
  cloneUrl: string;
  location: string;
  ref: string | null;
  path: string | null;
};

export function prepareInstallSources(input: string, staging: string, options: PrepareOptions = {}): PreparedSource[] {
  const local = resolve(input);
  if (existsSync(local) && lstatSync(local).isFile() && basename(local) === "sources.json") {
    if (options.ref) throw new CliError("--ref cannot be used with registry sources.");
    if (options.gitPath) throw new CliError("--path cannot be used with registry sources.");
    return prepareRegistrySources(local);
  }
  return prepareSources(input, staging, options);
}

export function prepareSource(input: string, staging: string, ref?: string): PreparedSource {
  const sources = prepareSources(input, staging, { ref });
  if (sources.length !== 1) {
    for (const source of sources) source.cleanup();
    throw new CliError("Skill source must contain exactly one Skill.");
  }
  return sources[0]!;
}

function prepareSources(input: string, staging: string, options: PrepareOptions): PreparedSource[] {
  validateGitRef(options.ref);
  const local = resolve(input);
  if (existsSync(local)) {
    if (options.gitPath) throw new CliError("--path can only be used with Git sources.");
    return [prepareLocalSource(input)];
  }
  return prepareGitSources(input, staging, options);
}

function prepareGitSources(input: string, staging: string, options: PrepareOptions): PreparedSource[] {
  const spec = gitSourceSpec(input, options);
  const cloneRoot = join(staging, `git-${Date.now()}-${process.pid}`);
  const stagedRoots: string[] = [];
  mkdirSync(cloneRoot, { recursive: true });
  const args = ["clone"];
  if (!spec.ref) args.push("--depth", "1");
  args.push("--", spec.cloneUrl, cloneRoot);
  const result = spawnSync("git", args, { encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) {
    rmSync(cloneRoot, { recursive: true, force: true });
    throw new CliError(`Git source failed: ${sanitizeError(result.stderr || result.error)}`);
  }
  if (spec.ref) {
    const checkout = spawnSync("git", ["-C", cloneRoot, "checkout", "--detach", spec.ref], {
      encoding: "utf8",
      shell: false
    });
    if (checkout.error || checkout.status !== 0) {
      rmSync(cloneRoot, { recursive: true, force: true });
      throw new CliError(`Git ref failed: ${sanitizeError(checkout.stderr || checkout.error)}`);
    }
  }
  const revision = spawnSync("git", ["-C", cloneRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    shell: false
  });
  try {
    const selectedRoot = spec.path ? join(cloneRoot, spec.path) : cloneRoot;
    const roots = skillRoots(selectedRoot, `Git source path contains no Skill: ${spec.path ?? "."}`);
    if (roots.length === 1) {
      validateTree(roots[0]!);
      return [{
        root: roots[0]!,
        type: "git",
        location: spec.location,
        ref: spec.ref,
        revision: revision.status === 0 ? revision.stdout.trim() : null,
        cleanup: () => rmSync(cloneRoot, { recursive: true, force: true })
      }];
    }
    const prepared = roots.map((root, index) => {
      const stagedRoot = join(staging, `git-skill-${Date.now()}-${process.pid}-${index}`);
      copySource(root, stagedRoot);
      stagedRoots.push(stagedRoot);
      return {
        root: stagedRoot,
        type: "git" as const,
        location: spec.location,
        ref: spec.ref,
        revision: revision.status === 0 ? revision.stdout.trim() : null,
        cleanup: () => rmSync(stagedRoot, { recursive: true, force: true })
      };
    });
    rmSync(cloneRoot, { recursive: true, force: true });
    return prepared;
  } catch (error) {
    for (const root of stagedRoots) rmSync(root, { recursive: true, force: true });
    rmSync(cloneRoot, { recursive: true, force: true });
    throw error;
  }
}

function prepareRegistrySources(path: string): PreparedSource[] {
  const value = readRegistry(path);
  const sources: PreparedSource[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.local_path !== "string") {
      throw new CliError(`Registry source is missing local_path: ${key}`);
    }
    for (const root of registrySkillRoots(path, entry.local_path, key)) {
      sources.push(prepareLocalSource(root));
    }
  }
  return sources;
}

function readRegistry(path: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value) || Array.isArray(value)) throw new Error("registry must be an object");
    return value;
  } catch (error) {
    throw new CliError(`Invalid registry source: ${sanitizeError(error)}`);
  }
}

function registrySkillRoots(registryPath: string, localPath: string, key: string): string[] {
  const root = resolveRegistryLocalPath(registryPath, localPath);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new CliError(`Registry source local_path is not a directory: ${key}`);
  }
  return skillRoots(root, `No Skill found for registry source: ${key}`);
}

function skillRoots(root: string, emptyMessage: string): string[] {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new CliError(`Skill source path is not a directory: ${root}`);
  }
  if (existsSync(join(root, "SKILL.md"))) return [root];
  const roots: string[] = [];
  walk(root, (path) => {
    if (basename(path) === "SKILL.md") roots.push(dirname(path));
  });
  roots.sort((a, b) => a.localeCompare(b));
  if (roots.length === 0) throw new CliError(emptyMessage);
  return roots;
}

function resolveRegistryLocalPath(registryPath: string, localPath: string): string {
  if (isAbsolute(localPath)) return localPath;
  const registryRelative = resolve(dirname(registryPath), localPath);
  if (existsSync(registryRelative)) return registryRelative;
  return resolve(dirname(dirname(registryPath)), localPath);
}

export function prepareLocalSource(input: string): PreparedSource {
  const local = resolve(input);
  if (!existsSync(local) || !lstatSync(local).isDirectory()) throw new CliError(`Skill source is not a directory: ${input}`);
  validateTree(local);
  return {
    root: local,
    type: "local",
    location: local,
    ref: null,
    revision: null,
    cleanup: () => undefined
  };
}

export function copySource(source: string, destination: string): void {
  cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    filter: (path) => basename(path) !== ".git"
  });
}

function validateTree(root: string): void {
  const rootReal = realpathSync(root);
  walk(root, (path) => {
    if (!lstatSync(path).isSymbolicLink()) return;
    if (isAbsolute(readlinkSync(path))) throw new CliError(`Skill contains an absolute symlink: ${path}`);
    let target: string;
    try {
      target = realpathSync(path);
    } catch {
      throw new CliError(`Skill contains a broken symlink: ${path}`);
    }
    if (!isInside(rootReal, target)) throw new CliError(`Skill symlink escapes its root: ${path}`);
  });
}

function gitSourceSpec(input: string, options: PrepareOptions): GitSourceSpec {
  const tree = githubTreeSpec(input);
  if (tree) {
    if (options.ref) throw new CliError("--ref cannot be used with GitHub tree URLs.");
    if (options.gitPath) throw new CliError("--path cannot be used with GitHub tree URLs.");
    return tree;
  }
  const encodedPath = pathFromSourceFragment(input);
  const requestedPath = options.gitPath ? normalizeGitPath(options.gitPath) : encodedPath;
  return {
    cloneUrl: stripSklpPathFragment(input),
    location: requestedPath ? sourceWithPathFragment(input, requestedPath) : sanitizeSource(input),
    ref: options.ref ?? null,
    path: requestedPath
  };
}

function githubTreeSpec(input: string): GitSourceSpec | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length < 5 || segments[2] !== "tree") return null;
  const [owner, repo,, ref, ...pathSegments] = segments;
  if (!owner || !repo || !ref || pathSegments.length === 0) return null;
  const path = normalizeGitPath(pathSegments.join("/"));
  const clone = new URL(url);
  clone.pathname = `/${owner}/${repo}.git`;
  clone.search = "";
  clone.hash = "";
  return {
    cloneUrl: clone.toString(),
    location: sanitizeSource(input),
    ref,
    path
  };
}

function validateGitRef(ref: string | undefined): void {
  if (ref && (ref.startsWith("-") || /[\0\r\n]/.test(ref))) throw new CliError("Invalid Git ref.");
}

function normalizeGitPath(path: string): string {
  if (!path.trim()) throw new CliError("Git source path cannot be empty.");
  if (isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)) throw new CliError("Git source path must be relative.");
  const normalized = posix.normalize(path.replace(/\\/g, "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new CliError("Git source path must stay inside the repository.");
  }
  return normalized;
}

function sourceWithPathFragment(input: string, path: string): string {
  try {
    const url = new URL(input);
    url.hash = `sklp-path=${encodeURIComponent(path)}`;
    return sanitizeSource(url.toString());
  } catch {
    return `${sanitizeSource(input)}#sklp-path=${encodeURIComponent(path)}`;
  }
}

function pathFromSourceFragment(input: string): string | null {
  try {
    const url = new URL(input);
    const match = /^#sklp-path=(.+)$/.exec(url.hash);
    return match ? normalizeGitPath(decodeURIComponent(match[1]!)) : null;
  } catch {
    const marker = "#sklp-path=";
    const index = input.indexOf(marker);
    return index >= 0 ? normalizeGitPath(decodeURIComponent(input.slice(index + marker.length))) : null;
  }
}

function stripSklpPathFragment(input: string): string {
  try {
    const url = new URL(input);
    if (/^#sklp-path=/.test(url.hash)) url.hash = "";
    return url.toString();
  } catch {
    return input.replace(/#sklp-path=.+$/, "");
  }
}

function walk(root: string, visit: (path: string) => void): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    visit(path);
    if (entry.isDirectory()) walk(path, visit);
  }
}

function sanitizeSource(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|password|secret/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value.replace(/(https?:\/\/)[^/@]+@/, "$1[redacted]@");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
