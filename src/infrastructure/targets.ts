import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function globalTarget(home = homedir()): { key: "agents"; path: string } {
  return { key: "agents", path: resolve(join(home, ".agents", "skills")) };
}
