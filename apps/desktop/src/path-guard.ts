import nodePath from "node:path";

export interface PathModule {
  normalize(path: string): string;
  resolve(...paths: string[]): string;
  sep: string;
}

export function resolveRendererFile(
  rendererRoot: string,
  pathname: string,
  path: PathModule = nodePath
): { filePath: string; allowed: boolean } {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(rendererRoot, path.normalize(relativePath));
  const allowed = filePath === rendererRoot || filePath.startsWith(`${rendererRoot}${path.sep}`);
  return { filePath, allowed };
}
