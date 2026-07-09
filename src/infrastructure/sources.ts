import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, isAbsolute, join, resolve } from "node:path";
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

export function prepareSource(input: string, staging: string, ref?: string): PreparedSource {
  if (ref && (ref.startsWith("-") || /[\0\r\n]/.test(ref))) throw new CliError("Invalid Git ref.");
  const local = resolve(input);
  if (existsSync(local)) {
    if (!lstatSync(local).isDirectory()) throw new CliError(`Skill source is not a directory: ${input}`);
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

  const cloneRoot = join(staging, `git-${Date.now()}-${process.pid}`);
  mkdirSync(cloneRoot, { recursive: true });
  const args = ["clone"];
  if (!ref) args.push("--depth", "1");
  args.push("--", input, cloneRoot);
  const result = spawnSync("git", args, { encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) {
    rmSync(cloneRoot, { recursive: true, force: true });
    throw new CliError(`Git source failed: ${sanitizeError(result.stderr || result.error)}`);
  }
  if (ref) {
    const checkout = spawnSync("git", ["-C", cloneRoot, "checkout", "--detach", ref], {
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
  validateTree(cloneRoot);
  return {
    root: cloneRoot,
    type: "git",
    location: sanitizeSource(input),
    ref: ref ?? null,
    revision: revision.status === 0 ? revision.stdout.trim() : null,
    cleanup: () => rmSync(cloneRoot, { recursive: true, force: true })
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
