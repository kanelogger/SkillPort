import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("link registers a local Skill without copying it and unlink preserves the source", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-link-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "linked-skill", "Live local skill");
  assert.equal(cli(["init"], { cwd: project, hub, home: root }).status, 0);

  const linked = cli(["link", source], { cwd: project, hub, home: root });
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(cli(["list"], { cwd: project, hub, home: root }).stdout, /linked-skill\s+Live local skill/);
  const catalog = JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8"));
  assert.equal(catalog.skills[0].name, "linked-skill");

  const enabled = cli(["enable", "linked-skill"], { cwd: project, hub, home: root });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(existsSync(join(project, ".agents", "skills", "linked-skill", "SKILL.md")), true);

  writeFileSync(join(source, "notes.md"), "visible through the managed link\n");
  assert.equal(existsSync(join(project, ".agents", "skills", "linked-skill", "notes.md")), true);
  assert.equal(existsSync(join(source, "meta.json")), false);
  assert.equal(cli(["doctor"], { cwd: project, hub, home: root }).status, 0);

  assert.equal(cli(["unlink", "linked-skill"], { cwd: project, hub, home: root }).status, 1);
  assert.equal(cli(["unlink", "linked-skill", "--force"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(existsSync(source), true);
  assert.equal(existsSync(join(source, "SKILL.md")), true);
  assert.equal(existsSync(join(hub, "skills", "linked-skill")), false);
  assert.deepEqual(JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8")).skills, []);
});

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
  cli(["enable", "sample-skill", "--global"], { cwd: project, hub, home: root });

  const result = cli(["remove", "sample-skill", "--force"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(project, ".agents", "skills", "sample-skill")), false);
  assert.equal(existsSync(join(root, ".agents", "skills", "sample-skill")), false);
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

test("Git remove publication failure restores the source collection and membership", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-remove-rollback-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  mkdirSync(project);
  mkdirSync(repo);
  makeSkill(join(repo, "skills", "git-rollback"), "git-rollback", "Git rollback skill");
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  commit(repo, "initial");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(repo).href, "--path", "skills"], options).status, 0);
  assert.equal(cli(["enable", "git-rollback"], options).status, 0);
  rmSync(join(hub, "catalog.md"));
  mkdirSync(join(hub, "catalog.md"));

  const result = cli(["remove", "git-rollback", "--force"], options);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(existsSync(join(hub, "skills", "git-rollback", "SKILL.md")), true);
  assert.match(cli(["list"], options).stdout, /git-rollback\s+Git rollback skill/);
  const state = new DatabaseSync(join(hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 1);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 1);
  state.close();
  const info = JSON.parse(cli(["info", "git-rollback"], options).stdout);
  assert.equal(info.skill.instanceId.length > 0, true);
  assert.equal(info.enablements.length, 1);
  assert.equal(info.enablements[0].health, "healthy");
});

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function commit(repo, message) {
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", message], repo);
}
