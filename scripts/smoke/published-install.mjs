import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const rawVersion = process.argv[2] ?? process.env.SKLP_PUBLISHED_VERSION;
assert.ok(rawVersion, "Usage: npm run smoke:published -- <version>");

const version = rawVersion.replace(/^v/, "");
assert.match(version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "version must be an exact SemVer version");

const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "npm_execpath is required to run npm portably from this smoke test.");

const root = mkdtempSync(join(tmpdir(), "sklp-published-"));
const env = {
  ...process.env,
  npm_config_cache: join(root, "npm-cache"),
  npm_config_fund: "false",
  npm_config_audit: "false"
};

const runNpm = (args, options = {}) => spawnSync(process.execPath, [npmCli, ...args], {
  ...options,
  encoding: "utf8",
  shell: false,
  env
});

const prefix = join(root, "prefix");
const retries = Number.parseInt(process.env.SKLP_PUBLISHED_INSTALL_RETRIES ?? "6", 10);
const retryDelayMs = Number.parseInt(process.env.SKLP_PUBLISHED_INSTALL_RETRY_DELAY_MS ?? "10000", 10);
let install;

for (let attempt = 1; attempt <= retries; attempt += 1) {
  install = runNpm([
    "install",
    "--global",
    "--prefix",
    prefix,
    `skill-port-cli@${version}`
  ]);
  if (install.status === 0) {
    break;
  }
  if (attempt < retries) {
    await delay(retryDelayMs);
  }
}

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
  "---\nname: published-smoke\ndescription: Published CLI core loop fixture\n---\n"
);

const smokeEnv = {
  ...process.env,
  HOME: root,
  USERPROFILE: root,
  SKLP_HOME: hub,
  SKLP_TEST_HOME: root
};
const run = (args) => runExecutable(args, {
  cwd: project,
  env: smokeEnv
});

assert.equal(run(["init"]).status, 0);
assert.equal(run(["install", source]).status, 0);
assert.match(run(["list"]).stdout, /published-smoke\s+Published CLI core loop fixture/);
const info = JSON.parse(run(["info", "published-smoke"]).stdout);
assert.equal(info.skill.name, "published-smoke");
assert.equal(run(["enable", "published-smoke"]).status, 0);
assert.equal(existsSync(join(project, ".agents", "skills", "published-smoke", "SKILL.md")), true);
assert.equal(run(["disable", "published-smoke"]).status, 0);
assert.equal(run(["remove", "published-smoke"]).status, 0);
assert.equal(existsSync(join(hub, "skills", "published-smoke")), false);

const uninstall = runExecutable(["uninstall"], { input: "y\n" });
assert.equal(uninstall.status, 0, uninstall.stderr);
assert.equal(existsSync(hub), false);
assert.equal(existsSync(executable), false);

console.log(`Published CLI installation, core loop, and self-uninstallation verified for skill-port-cli@${version}.`);
