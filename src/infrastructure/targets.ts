import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CliError } from "../domain/errors.js";

export const toolKeys = ["claude", "codex", "cursor", "agents", "pi", "opencode", "trae", "trae-cn"] as const;
export type ToolKey = typeof toolKeys[number];

export function globalTarget(key: string, home = homedir()): { key: ToolKey; path: string } {
  if (!toolKeys.includes(key as ToolKey)) throw new CliError(`Unsupported global tool: ${key}`);
  const paths: Record<ToolKey, string> = {
    claude: join(home, ".claude", "skills"),
    codex: join(home, ".agents", "skills"),
    cursor: join(home, ".cursor", "skills"),
    agents: join(home, ".agents", "skills"),
    pi: join(home, ".pi", "agent", "skills"),
    opencode: opencodePath(home),
    trae: join(home, ".trae", "skills"),
    "trae-cn": join(home, ".trae-cn", "skills")
  };
  return { key: key as ToolKey, path: resolve(paths[key as ToolKey]) };
}

function opencodePath(home: string): string {
  const primary = join(home, ".config", "opencode", "skills");
  const fallback = join(home, ".opencode", "skills");
  if (!existsSync(primary) && existsSync(fallback)) return fallback;
  return primary;
}
