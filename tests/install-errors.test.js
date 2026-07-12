import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("invalid metadata leaves no partial registration", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-invalid-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  mkdirSync(source);
  writeFileSync(join(source, "SKILL.md"), "---\nname: Invalid Name\n---\n");
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.equal(existsSync(join(hub, "skills", "Invalid Name")), false);
  assert.deepEqual(JSON.parse(String(cli(["list"], { cwd: project, hub, home: root }).stdout || "\"\"")), "");
});

test("invalid names include a slug suggestion when one is available", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-invalid-suggestion-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  mkdirSync(source);
  writeFileSync(join(source, "SKILL.md"), "---\nname: yixueAIganhuo-PPT\ndescription: Invalid name\n---\n");
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Suggested name: yixueaiganhuo-ppt/);
});

test("duplicate name preserves the original installation", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-duplicate-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const first = join(root, "first");
  const second = join(root, "second");
  mkdirSync(project);
  makeSkill(first, "same-skill", "First");
  makeSkill(second, "same-skill", "Second");
  cli(["init"], { cwd: project, hub, home: root });
  assert.equal(cli(["install", first], { cwd: project, hub, home: root }).status, 0);

  const result = cli(["install", second], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /change the incoming Skill's SKILL\.md name/i);
  assert.match(cli(["list"], { cwd: project, hub, home: root }).stdout, /same-skill\s+First/);
});

test("an abandoned mutation lock from a dead process is cleared", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-lock-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  writeFileSync(join(hub, ".mutation.lock"), "2147483647\n");

  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
});

test("catalog publication failure rolls back the installed Skill and database row", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-catalog-failure-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  rmSync(join(hub, "catalog.md"));
  mkdirSync(join(hub, "catalog.md"));

  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.equal(existsSync(join(hub, "skills", "sample-skill")), false);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
  const catalog = JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8"));
  assert.deepEqual(catalog.skills, []);
});

test("install preserves an unregistered Hub destination", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-hub-conflict-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  const conflict = join(hub, "skills", "sample-skill");
  mkdirSync(conflict);
  writeFileSync(join(conflict, "keep.txt"), "keep");

  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Hub destination already exists/);
  assert.equal(readFileSync(join(conflict, "keep.txt"), "utf8"), "keep");
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});
