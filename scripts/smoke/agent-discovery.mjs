import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "sklp-discovery-"));
const project = join(root, "project");
const source = join(root, "source");
const hub = join(root, "hub");
mkdirSync(project);
mkdirSync(source);
await import("node:fs").then(({ writeFileSync }) => {
  writeFileSync(join(source, "SKILL.md"), "---\nname: discovery-skill\ndescription: Discovery contract fixture\n---\n");
});

const run = (args) => spawnSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args], {
  cwd: project,
  env: { ...process.env, SKLP_HOME: hub, SKLP_TEST_HOME: root },
  encoding: "utf8"
});

assert.equal(run(["init"]).status, 0);
assert.equal(run(["install", source]).status, 0);
const result = run(["enable", "discovery-skill", "--global"]);
assert.equal(result.status, 0, result.stderr);
const entry = result.stdout.match(/Entry: (.+)/)?.[1]?.trim();
assert.ok(entry && existsSync(join(entry, "SKILL.md")), "missing discoverable SKILL.md");
assert.equal(run(["disable", "discovery-skill", "--global"]).status, 0);
console.log("Verified the shared Agent target contract.");
