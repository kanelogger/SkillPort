import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("enable refuses to overwrite an unmanaged target", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-conflict-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(join(project, ".agents", "skills"), { recursive: true });
  makeSkill(source);
  const conflict = join(project, ".agents", "skills", "sample-skill");
  writeFileSync(conflict, "keep me");
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });

  const result = cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(conflict, "utf8"), "keep me");
});

test("enable refuses to adopt an unregistered link to the Hub", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-unregistered-link-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  const entry = join(project, ".agents", "skills", "sample-skill");
  mkdirSync(join(project, ".agents", "skills"), { recursive: true });
  symlinkSync(join(hub, "skills", "sample-skill"), entry, "dir");

  const result = cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not registered/);
  assert.equal(existsSync(join(entry, "SKILL.md")), true);
  const info = JSON.parse(cli(["info", "sample-skill"], { cwd: project, hub, home: root }).stdout);
  assert.deepEqual(info.enablements, []);
});
