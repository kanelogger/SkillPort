import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("update preserves identity and active links", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-update-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "updatable-skill", "Before");
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "updatable-skill"], { cwd: project, hub, home: root });
  const before = JSON.parse(readFileSync(join(hub, "skills", "updatable-skill", "meta.json"), "utf8"));

  makeSkill(source, "updatable-skill", "After");
  const result = cli(["update", "updatable-skill"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(readFileSync(join(hub, "skills", "updatable-skill", "meta.json"), "utf8"));
  assert.equal(after.instanceId, before.instanceId);
  assert.equal(after.description, "After");
  assert.equal(existsSync(join(project, ".agents", "skills", "updatable-skill", "SKILL.md")), true);
});

test("force remove disables all managed entries first", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-force-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill", "--global", "codex"], { cwd: project, hub, home: root });

  const result = cli(["remove", "sample-skill", "--force"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(project, ".agents", "skills", "sample-skill")), false);
  assert.equal(existsSync(join(root, ".codex", "skills", "sample-skill")), false);
});

test("update rejects a changed name and restores previous content", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-rename-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "stable-name", "Before");
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  writeFileSync(join(source, "SKILL.md"), "---\nname: changed-name\ndescription: After\n---\n");

  const result = cli(["update", "stable-name"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(readFileSync(join(hub, "skills", "stable-name", "SKILL.md"), "utf8"), /name: stable-name/);
});

test("reinstalling after removal creates a new instance identity", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-reinstall-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  const before = JSON.parse(cli(["info", "sample-skill"], { cwd: project, hub, home: root }).stdout).skill.instanceId;
  cli(["remove", "sample-skill"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  const after = JSON.parse(cli(["info", "sample-skill"], { cwd: project, hub, home: root }).stdout).skill.instanceId;
  assert.notEqual(after, before);
});

test("update publication failure restores previous content and state", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-update-rollback-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "rollback-skill", "Before");
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  makeSkill(source, "rollback-skill", "After");
  rmSync(join(hub, "catalog.md"));
  mkdirSync(join(hub, "catalog.md"));

  const result = cli(["update", "rollback-skill"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(readFileSync(join(hub, "skills", "rollback-skill", "SKILL.md"), "utf8"), /Before/);
  assert.match(cli(["list"], { cwd: project, hub, home: root }).stdout, /rollback-skill\s+Before/);
});

test("remove publication failure restores the Skill and registration", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-remove-rollback-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "rollback-skill", "Keep me");
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  rmSync(join(hub, "catalog.md"));
  mkdirSync(join(hub, "catalog.md"));

  const result = cli(["remove", "rollback-skill"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.equal(existsSync(join(hub, "skills", "rollback-skill", "SKILL.md")), true);
  assert.match(cli(["list"], { cwd: project, hub, home: root }).stdout, /rollback-skill\s+Keep me/);
});
