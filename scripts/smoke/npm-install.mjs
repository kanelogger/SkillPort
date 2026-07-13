import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "sklp-package-"));
const env = { ...process.env, npm_config_cache: join(root, "npm-cache") };
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required to run npm portably from this smoke test.");
const runNpm = (args, options = {}) => spawnSync(process.execPath, [npmCli, ...args], {
  ...options,
  encoding: "utf8",
  shell: false,
  env
});
const pack = runNpm(["pack", "--json", "--pack-destination", root], {
  cwd: process.cwd(),
});
assert.equal(pack.status, 0, pack.stderr ?? pack.error?.message);
const packResult = JSON.parse(pack.stdout);
const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
assert.ok(packed, "npm pack did not return package metadata.");
const filename = packed.filename;
const files = packed.files.map((file) => file.path);
assert.ok(files.includes("dist/cli.js"));
assert.ok(files.includes("docs/supported-targets.md"));
assert.equal(files.some((path) => path.startsWith("src/") || path.startsWith("tests/")), false);
const prefix = join(root, "prefix");
const install = runNpm(["install", "--global", "--prefix", prefix, join(root, filename)]);
assert.equal(install.status, 0, install.stderr ?? install.error?.message);
const executable = process.platform === "win32"
  ? join(prefix, "sklp.cmd")
  : join(prefix, "bin", "sklp");
const runExecutable = (args, options = {}) => spawnSync(executable, args, {
  ...options,
  encoding: "utf8",
  shell: process.platform === "win32"
});
const help = runExecutable(["--help"]);
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /Local Agent Skill hub/);

const project = join(root, "project");
const source = join(root, "source");
const hub = join(root, "hub");
mkdirSync(project);
mkdirSync(source);
writeFileSync(
  join(source, "SKILL.md"),
  "---\nname: package-smoke\ndescription: Packed CLI core loop fixture\n---\n"
);
const smokeEnv = { ...process.env, SKLP_HOME: hub, SKLP_TEST_HOME: root };
const run = (args) => runExecutable(args, {
  cwd: project,
  env: smokeEnv
});

assert.equal(run(["init"]).status, 0);
assert.equal(run(["install", source]).status, 0);
assert.match(run(["list"]).stdout, /package-smoke\s+Packed CLI core loop fixture/);
const info = JSON.parse(run(["info", "package-smoke"]).stdout);
assert.equal(info.skill.name, "package-smoke");
assert.equal(run(["enable", "package-smoke"]).status, 0);
assert.equal(existsSync(join(project, ".agents", "skills", "package-smoke", "SKILL.md")), true);
assert.equal(run(["disable", "package-smoke"]).status, 0);
assert.equal(run(["remove", "package-smoke"]).status, 0);
assert.equal(existsSync(join(hub, "skills", "package-smoke")), false);

console.log("Packed CLI installation and core loop verified.");
