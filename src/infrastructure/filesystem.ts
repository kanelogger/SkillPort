import {
  closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync,
  realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { CliError } from "../domain/errors.js";
import type { HubPaths } from "./config.js";

export function withHubLock<T>(paths: HubPaths, fn: () => T): T {
  mkdirSync(paths.root, { recursive: true });
  let fd: number;
  try {
    fd = openSync(paths.lock, "wx");
  } catch {
    if (clearAbandonedLock(paths.lock)) {
      try {
        fd = openSync(paths.lock, "wx");
      } catch {
        throw new CliError("Another Skill Port mutation is in progress.");
      }
    } else {
      throw new CliError("Another Skill Port mutation is in progress.");
    }
  }
  try {
    writeFileSync(fd, `${process.pid}\n`);
    return fn();
  } finally {
    closeSync(fd);
    rmSync(paths.lock, { force: true });
  }
}

function clearAbandonedLock(path: string): boolean {
  try {
    const pid = Number(readFileSync(path, "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error: any) {
      if (error?.code !== "ESRCH") return false;
      unlinkSync(path);
      return true;
    }
  } catch {
    return false;
  }
}

export function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

export function managedLinkState(entry: string, expected: string): "absent" | "correct" | "conflict" {
  if (!existsSync(entry) && !safeLstat(entry)) return "absent";
  const stats = safeLstat(entry);
  if (!stats?.isSymbolicLink()) return "conflict";
  try {
    return realpathSync(entry) === realpathSync(expected) ? "correct" : "conflict";
  } catch {
    return "conflict";
  }
}

export function createDirectoryLink(
  source: string,
  entry: string,
  platform = process.platform,
  create: typeof symlinkSync = symlinkSync
): "symlink" | "junction" {
  mkdirSync(dirname(entry), { recursive: true });
  if (platform === "win32") {
    try {
      create(source, entry, "dir");
      return "symlink";
    } catch (error) {
      if (!isWindowsSymlinkPermissionError(error)) throw error;
      create(resolve(source), entry, "junction");
      return "junction";
    }
  }
  create(source, entry, "dir");
  return "symlink";
}

export function removeOwnedLink(entry: string, expected: string): void {
  if (managedLinkState(entry, expected) !== "correct") {
    throw new CliError(`Refusing to remove unmanaged entry: ${entry}`);
  }
  unlinkSync(entry);
}

export function linkTarget(entry: string): string | null {
  try {
    return readlinkSync(entry);
  } catch {
    return null;
  }
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeLstat(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function isWindowsSymlinkPermissionError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  return code === "EPERM" || code === "EACCES";
}
