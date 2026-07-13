import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("machine-readable output is available for core automation commands", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-json-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "json-skill", "Machine readable Skill");
  assert.equal(cli(["init"], { cwd: project, hub, home: root }).status, 0);

  const installed = cli(["install", source, "--json"], { cwd: project, hub, home: root });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(installed.stderr, "");
  const installedValue = JSON.parse(installed.stdout);
  assert.deepEqual(Object.keys(installedValue), ["skills"]);
  assert.deepEqual(Object.keys(installedValue.skills[0]).sort(), ["description", "instanceId", "name"]);
  assert.equal(installedValue.skills[0].name, "json-skill");

  const listed = cli(["list", "--json"], { cwd: project, hub, home: root });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).skills.map((skill) => skill.name), ["json-skill"]);

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
