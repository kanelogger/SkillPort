import { existsSync, lstatSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { RpcRequest } from "./shared/rpc.js";

export function authorizeRpcPaths(request: RpcRequest, approvedPaths: ReadonlySet<string>): void {
  const params = request.params as Record<string, unknown>;
  switch (request.method) {
    case "initialize":
      requireInitializationPath(params.project, "project", approvedPaths);
      if (params.hub !== undefined) requireInitializationPath(params.hub, "hub", approvedPaths);
      break;
    case "registerProject":
      requireApproved(params.path, approvedPaths);
      break;
    case "previewLink":
    case "link":
      requireApproved(params.source, approvedPaths);
      break;
    case "previewInstall":
    case "install":
      if (!isRemoteGitSource(params.source)) requireApproved(params.source, approvedPaths);
      break;
  }
}

function requireInitializationPath(
  value: unknown,
  kind: "project" | "hub",
  approvedPaths: ReadonlySet<string>
): void {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(`${kind === "project" ? "Project" : "Hub"} path must be absolute.`);
  }
  const path = resolve(value);
  if (approvedPaths.has(path)) return;
  if (kind === "project") {
    if (!existsSync(path) || !lstatSync(path).isDirectory()) {
      throw new Error("Project path must be an existing directory.");
    }
    return;
  }
  let ancestor = path;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("Hub path has no existing parent directory.");
    ancestor = parent;
  }
  if (!lstatSync(ancestor).isDirectory()) throw new Error("Hub path parent must be a directory.");
}

function requireApproved(value: unknown, approvedPaths: ReadonlySet<string>): void {
  if (typeof value !== "string" || !approvedPaths.has(resolve(value))) {
    throw new Error("Local path must be selected through the system dialog.");
  }
}

function isRemoteGitSource(value: unknown): boolean {
  return typeof value === "string"
    && (/^(?:https?|ssh|git):\/\//i.test(value) || /^[^/\s@]+@[^/\s:]+:.+/.test(value));
}
