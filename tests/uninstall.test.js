import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("uninstall cancels unless confirmation is an exact y", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const result = runUninstall(fixture, "Y\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Uninstall cancelled/);
  assert.equal(existsSync(fixture.hub), true);
  assert.equal(existsSync(fixture.projectEntry), true);
  assert.equal(existsSync(fixture.globalEntry), true);
  assert.equal(existsSync(fixture.npmMarker), false);
});

test("uninstall cancels when standard input closes", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const result = runUninstall(fixture, "");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Uninstall cancelled/);
  assert.equal(existsSync(fixture.hub), true);
  assert.equal(existsSync(fixture.npmMarker), false);
});

test("uninstall does not expose a JSON confirmation bypass", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const result = cli(["uninstall", "--json"], {
    ...fixture.options,
    input: "y\n",
    env: {
      npm_execpath: fixture.npmCli,
      SKLP_NPM_MARKER: fixture.npmMarker
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option '--json'/);
  assert.equal(existsSync(fixture.hub), true);
  assert.equal(existsSync(fixture.npmMarker), false);
});

test("uninstall removes managed state and preserves linked source directories", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const result = runUninstall(fixture, "y\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Uninstalled sklp/);
  assert.equal(existsSync(fixture.projectEntry), false);
  assert.equal(existsSync(fixture.globalEntry), false);
  assert.equal(existsSync(fixture.hub), false);
  assert.equal(existsSync(fixture.locator), false);
  assert.equal(existsSync(join(fixture.linkedSource, "SKILL.md")), true);
  assert.equal(readMarker(fixture.npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall removes the Hub and CLI when state cannot be read", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFileSync(join(fixture.hub, "state.db"), "not a sqlite database");

  const result = runUninstall(fixture, "y\n");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not read managed Agent entries/);
  assert.equal(existsSync(fixture.hub), false);
  assert.equal(readMarker(fixture.npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall still removes the CLI when Hub cleanup cannot acquire its lock", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFileSync(join(fixture.hub, ".mutation.lock"), "not-a-process-id\n");

  const result = runUninstall(fixture, "y\n");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Another Skill Port mutation is in progress/);
  assert.equal(existsSync(fixture.hub), true);
  assert.equal(readMarker(fixture.npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall removes the CLI when the Hub is already missing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-uninstall-missing-hub-"));
  const hub = join(root, "hub");
  const npmCli = join(root, "fake-npm.mjs");
  const npmMarker = join(root, "npm-args.txt");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFakeNpm(npmCli);

  const result = cli(["uninstall"], {
    cwd: root,
    hub,
    home: root,
    input: "y\n",
    env: { npm_execpath: npmCli, SKLP_NPM_MARKER: npmMarker }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(hub), false);
  assert.equal(readMarker(npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall continues after a managed entry is replaced with a directory", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  rmSync(fixture.projectEntry);
  mkdirSync(fixture.projectEntry, { recursive: true });
  writeFileSync(join(fixture.projectEntry, "keep.txt"), "user content");

  const result = runUninstall(fixture, "y\n");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Recorded entry is not a link/);
  assert.equal(readFileSync(join(fixture.projectEntry, "keep.txt"), "utf8"), "user content");
  assert.equal(existsSync(fixture.globalEntry), false);
  assert.equal(existsSync(fixture.hub), false);
  assert.equal(readMarker(fixture.npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall reports an npm failure after cleaning the Hub", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFailingFakeNpm(fixture.npmCli);

  const result = runUninstall(fixture, "y\n");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not uninstall skill-port-cli with npm: npm failed/);
  assert.equal(existsSync(fixture.hub), false);
  assert.equal(readMarker(fixture.npmMarker), "uninstall --global skill-port-cli");
});

test("uninstall uses Chinese prompts and results in Chinese mode", (t) => {
  const fixture = setupFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const result = runUninstall(fixture, "y\n", { SKLP_LANG: "zh-CN" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /确认卸载 sklp/);
  assert.match(result.stdout, /已卸载 sklp/);
});

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "sklp-uninstall-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const copiedSource = join(root, "copied-source");
  const linkedSource = join(root, "linked-source");
  const locator = join(root, ".skill-port.json");
  const npmCli = join(root, "fake-npm.mjs");
  const npmMarker = join(root, "npm-args.txt");
  mkdirSync(project);
  makeSkill(copiedSource, "copied-skill");
  makeSkill(linkedSource, "linked-skill");
  writeFileSync(locator, `${JSON.stringify({ hubPath: hub })}\n`);
  writeFakeNpm(npmCli);

  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", copiedSource], options).status, 0);
  assert.equal(cli(["link", linkedSource], options).status, 0);
  assert.equal(cli(["enable", "copied-skill"], options).status, 0);
  assert.equal(cli(["enable", "copied-skill", "--global"], options).status, 0);

  return {
    root,
    hub,
    projectEntry: join(project, ".agents", "skills", "copied-skill"),
    globalEntry: join(root, ".agents", "skills", "copied-skill"),
    linkedSource,
    locator,
    npmCli,
    npmMarker,
    options
  };
}

function runUninstall(fixture, input, env = {}) {
  return cli(["uninstall"], {
    ...fixture.options,
    input,
    env: {
      npm_execpath: fixture.npmCli,
      SKLP_NPM_MARKER: fixture.npmMarker,
      ...env
    }
  });
}

function readMarker(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function writeFakeNpm(path) {
  writeFileSync(path, [
    'import { writeFileSync } from "node:fs";',
    'writeFileSync(process.env.SKLP_NPM_MARKER, process.argv.slice(2).join(" "));'
  ].join("\n"));
}

function writeFailingFakeNpm(path) {
  writeFileSync(path, [
    'import { writeFileSync } from "node:fs";',
    'writeFileSync(process.env.SKLP_NPM_MARKER, process.argv.slice(2).join(" "));',
    'process.stderr.write("npm failed");',
    "process.exit(1);"
  ].join("\n"));
}
