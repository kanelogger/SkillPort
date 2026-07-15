import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CliError } from "../domain/errors.js";

const locatorName = ".skill-port.json";

export type HubPaths = {
  root: string;
  database: string;
  skills: string;
  staging: string;
  catalogJson: string;
  catalogMarkdown: string;
  config: string;
  lock: string;
};

export function resolveHub(explicit?: string): HubPaths {
  let root = explicit ?? process.env.SKLP_HOME;
  if (!root) {
    const locator = join(homedir(), locatorName);
    if (existsSync(locator)) {
      try {
        root = JSON.parse(readFileSync(locator, "utf8")).hubPath;
      } catch {
        throw new CliError(`Invalid Skill Port locator: ${locator}`);
      }
    }
  }
  root = resolve(root ?? join(homedir(), ".skill-port"));
  return {
    root,
    database: join(root, "state.db"),
    skills: join(root, "skills"),
    staging: join(root, ".staging"),
    catalogJson: join(root, "catalog.json"),
    catalogMarkdown: join(root, "catalog.md"),
    config: join(root, "config.json"),
    lock: join(root, ".mutation.lock")
  };
}

export function initializeHub(paths: HubPaths, persistLocator = false): void {
  mkdirSync(paths.skills, { recursive: true });
  mkdirSync(paths.staging, { recursive: true });
  writeFileSync(paths.config, `${JSON.stringify({ hubPath: paths.root }, null, 2)}\n`);
  if (persistLocator && !process.env.SKLP_HOME) {
    const locator = join(homedir(), locatorName);
    mkdirSync(dirname(locator), { recursive: true });
    writeFileSync(locator, `${JSON.stringify({ hubPath: paths.root }, null, 2)}\n`);
  }
}

export function removeHubLocator(paths: HubPaths): void {
  const locator = join(homedir(), locatorName);
  if (!existsSync(locator)) return;
  try {
    const value = JSON.parse(readFileSync(locator, "utf8"));
    if (typeof value?.hubPath === "string" && resolve(value.hubPath) === paths.root) unlinkSync(locator);
  } catch {
    // An unreadable locator is not safe to claim as the active Hub locator.
  }
}
