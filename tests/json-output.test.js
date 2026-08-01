import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("machine-readable output is available for core automation commands", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-json-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "json-skill", "Machine readable Skill");
  assert.equal(cli(["agent", "setup", "--json"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["init"], { cwd: project, hub, home: root }).status, 0);

  const installed = cli(["install", source, "--json"], { cwd: project, hub, home: root });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(installed.stderr, "");
  const installedValue = JSON.parse(installed.stdout);
  assert.deepEqual(Object.keys(installedValue), ["skills"]);
  assert.deepEqual(Object.keys(installedValue.skills[0]).sort(), ["description", "instanceId", "name", "tags"]);
  assert.equal(installedValue.skills[0].name, "json-skill");
  assert.deepEqual(installedValue.skills[0].tags, []);

  const tagPreview = cli(["tag", "add", "develop", "json-skill", "--dry-run", "--json"], { cwd: project, hub, home: root });
  assert.equal(tagPreview.status, 0, tagPreview.stderr);
  assert.deepEqual(JSON.parse(tagPreview.stdout), {
    dryRun: true,
    tag: "develop",
    skills: [{ ...installedValue.skills[0], tags: ["develop"] }]
  });

  const exported = cli(["export", join(root, "catalog.html"), "--json"], { cwd: project, hub, home: root });
  assert.equal(exported.status, 0, exported.stderr);
  assert.deepEqual(JSON.parse(exported.stdout), {
    output: resolve(root, "catalog.html"),
    skillCount: 1
  });

  const listed = cli(["list", "--json"], { cwd: project, hub, home: root });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).skills.map((skill) => skill.name), ["json-skill"]);

  const statusListed = cli(["list", "--status", "--json"], { cwd: project, hub, home: root });
  assert.equal(statusListed.status, 0, statusListed.stderr);
  assert.deepEqual(JSON.parse(statusListed.stdout).skills.map((skill) => ({
    name: skill.name,
    installationKind: skill.installationKind,
    enablementCount: skill.enablementCount,
    health: skill.health
  })), [{
    name: "json-skill",
    installationKind: "local-copy",
    enablementCount: 0,
    health: "not-enabled"
  }]);

  const prunePreview = cli(["prune", "--dry-run", "--json"], { cwd: project, hub, home: root });
  assert.equal(prunePreview.status, 0, prunePreview.stderr);
  assert.deepEqual(JSON.parse(prunePreview.stdout), {
    dryRun: true,
    planned: [{ name: "json-skill" }],
    skipped: []
  });

  const enabled = cli(["enable", "json-skill", "--json"], { cwd: project, hub, home: root });
  assert.equal(enabled.status, 0, enabled.stderr);
  const enabledValue = JSON.parse(enabled.stdout);
  assert.equal(enabledValue.enablement.targetType, "project");
  assert.equal(enabledValue.enablement.targetKey, realpathSync(project));

  const healthy = cli(["doctor", "--json"], { cwd: project, hub, home: root });
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.deepEqual(JSON.parse(healthy.stdout), { healthy: true, diagnostics: [] });

  rmSync(join(project, ".agents", "skills", "json-skill"));
  const unhealthy = cli(["doctor", "--json"], { cwd: project, hub, home: root });
  assert.equal(unhealthy.status, 1);
  const unhealthyValue = JSON.parse(unhealthy.stdout);
  assert.equal(unhealthyValue.healthy, false);
  assert.equal(unhealthyValue.diagnostics[0].code, "ENABLEMENT_DRIFT");
  assert.match(unhealthyValue.diagnostics[0].suggestion, /sklp disable/);
});

test("JSON commands return a stable JSON error envelope", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-json-error-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  assert.equal(cli(["init"], { cwd: project, hub, home: root }).status, 0);

  const result = cli(["enable", "missing-skill", "--json"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    error: { code: "COMMAND_FAILED", message: "Skill not installed: missing-skill" }
  });
});
