import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function makeSkill(root, name = "sample-skill", description = "A sample skill") {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
}

export function cli(args, options) {
  const result = spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      HOME: options.home,
      USERPROFILE: options.home,
      SKLP_HOME: options.hub,
      SKLP_TEST_HOME: options.home,
      ...options.env
    },
    encoding: "utf8",
    input: options.input
  });
  return result;
}
