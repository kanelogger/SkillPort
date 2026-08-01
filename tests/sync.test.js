import assert from "node:assert/strict";
import {
  existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("sync previews and applies added, updated, and missing Skills before explicit pruning", (t) => {
  const fixture = setup("reconcile");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "alpha"), "sync-alpha", "Alpha before");
  makeSkill(join(fixture.repo, "skills", "beta"), "sync-beta", "Beta before");
  const initialRevision = commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);

  const installedDb = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(installedDb.prepare("SELECT COUNT(*) AS count FROM sources").get().count, 1);
  assert.equal(installedDb.prepare("SELECT COUNT(*) AS count FROM source_memberships").get().count, 2);
  assert.deepEqual({ ...installedDb.prepare(`
    SELECT location,source_ref,source_tracking,scan_path,last_revision FROM sources
  `).get() }, {
    location: fixture.url,
    source_ref: null,
    source_tracking: "default-branch",
    scan_path: "skills",
    last_revision: initialRevision
  });
  assert.deepEqual(installedDb.prepare(`
    SELECT skill_path FROM source_memberships ORDER BY skill_path
  `).all().map((row) => row.skill_path), ["skills/alpha", "skills/beta"]);
  installedDb.close();

  makeSkill(join(fixture.repo, "skills", "alpha"), "sync-alpha", "Alpha after");
  makeSkill(join(fixture.repo, "skills", "gamma"), "sync-gamma", "Gamma added");
  rmSync(join(fixture.repo, "skills", "beta"), { recursive: true });
  const revision = commit(fixture.repo, "reconcile");

  const beforeAlpha = readFileSync(join(fixture.hub, "skills", "sync-alpha", "SKILL.md"), "utf8");
  const preview = cli(["sync", fixture.url, "--path", "skills", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stderr, "");
  const planned = JSON.parse(preview.stdout);
  assert.equal(planned.dryRun, true);
  assert.deepEqual(planned.sources[0].added, [{ name: "sync-gamma", path: "skills/gamma", revision }]);
  assert.deepEqual(planned.sources[0].updated, [{ name: "sync-alpha", path: "skills/alpha", revision }]);
  assert.deepEqual(planned.sources[0].missing, [{
    name: "sync-beta", path: "skills/beta", enabled: false, action: "retain"
  }]);
  assert.deepEqual(planned.sources[0].removed, []);
  assert.deepEqual(planned.sources[0].failed, []);
  assert.equal(readFileSync(join(fixture.hub, "skills", "sync-alpha", "SKILL.md"), "utf8"), beforeAlpha);
  assert.equal(existsSync(join(fixture.hub, "skills", "sync-gamma")), false);
  const previewDb = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(previewDb.prepare(`
    SELECT status FROM source_memberships
    JOIN skills ON skills.instance_id=source_memberships.skill_id
    WHERE skills.name='sync-beta'
  `).get().status, "active");
  assert.equal(previewDb.prepare("SELECT last_revision FROM sources").get().last_revision, initialRevision);
  previewDb.close();

  const applied = cli(["sync", fixture.url, "--path", "skills", "--json"], fixture.options);
  assert.equal(applied.status, 0, applied.stderr);
  const result = JSON.parse(applied.stdout).sources[0];
  assert.deepEqual(result.added.map((item) => item.name), ["sync-gamma"]);
  assert.deepEqual(result.updated.map((item) => item.name), ["sync-alpha"]);
  assert.deepEqual(result.missing.map((item) => item.name), ["sync-beta"]);
  assert.match(readFileSync(join(fixture.hub, "skills", "sync-alpha", "SKILL.md"), "utf8"), /Alpha after/);
  assert.equal(existsSync(join(fixture.hub, "skills", "sync-gamma", "SKILL.md")), true);
  assert.equal(existsSync(join(fixture.hub, "skills", "sync-beta", "SKILL.md")), true);
  const appliedDb = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(appliedDb.prepare(`
    SELECT status FROM source_memberships
    JOIN skills ON skills.instance_id=source_memberships.skill_id
    WHERE skills.name='sync-beta'
  `).get().status, "missing");
  assert.equal(appliedDb.prepare("SELECT last_revision FROM sources").get().last_revision, revision);
  appliedDb.close();

  const allPreview = cli(["sync", "--all", "--dry-run", "--json"], fixture.options);
  assert.equal(allPreview.status, 0, allPreview.stderr);
  assert.deepEqual(JSON.parse(allPreview.stdout).sources[0].unchanged.map((item) => item.name), ["sync-alpha", "sync-gamma"]);
  const chinese = cli(["sync", "--all", "--dry-run"], {
    ...fixture.options,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(chinese.status, 0, chinese.stderr);
  assert.match(chinese.stdout, /同步预览/);
  assert.match(chinese.stdout, /缺失 sync-beta：保留本地副本/);

  const pruned = cli(["sync", "--all", "--prune", "--json"], fixture.options);
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.deepEqual(JSON.parse(pruned.stdout).sources[0].removed, [{ name: "sync-beta" }]);
  assert.equal(existsSync(join(fixture.hub, "skills", "sync-beta")), false);
  assert.doesNotMatch(readFileSync(join(fixture.hub, "catalog.json"), "utf8"), /sync-beta/);
});

test("sync protects enabled missing Skills unless pruning is forced", (t) => {
  const fixture = setup("enabled");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "enabled"), "enabled-missing", "Enabled upstream Skill");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  assert.equal(cli(["enable", "enabled-missing"], fixture.options).status, 0);
  const entry = join(fixture.project, ".agents", "skills", "enabled-missing");
  rmSync(join(fixture.repo, "skills"), { recursive: true });
  commit(fixture.repo, "delete all skills");

  const protectedResult = cli(["sync", "--all", "--prune", "--json"], fixture.options);
  assert.equal(protectedResult.status, 0, protectedResult.stderr);
  const protectedSource = JSON.parse(protectedResult.stdout).sources[0];
  assert.deepEqual(protectedSource.missing, [{
    name: "enabled-missing", path: "skills/enabled", enabled: true, action: "skip-enabled"
  }]);
  assert.deepEqual(protectedSource.removed, []);
  assert.equal(existsSync(join(entry, "SKILL.md")), true);

  const forced = cli(["sync", "--all", "--prune", "--force", "--json"], fixture.options);
  assert.equal(forced.status, 0, forced.stderr);
  assert.deepEqual(JSON.parse(forced.stdout).sources[0].removed, [{ name: "enabled-missing" }]);
  assert.equal(existsSync(entry), false);
  assert.equal(cli(["info", "enabled-missing"], fixture.options).status, 1);
});

test("sync adopts matching legacy Git Skills without guessing unrelated installations", (t) => {
  const fixture = setup("legacy");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "legacy"), "legacy-sync", "Legacy Skill");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.exec("DELETE FROM source_memberships; DELETE FROM sources;");
  db.close();

  const result = cli(["sync", fixture.url, "--path", "skills", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).sources[0].unchanged.map((item) => item.name), ["legacy-sync"]);
  const after = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(after.prepare("SELECT COUNT(*) AS count FROM sources").get().count, 1);
  assert.equal(after.prepare("SELECT COUNT(*) AS count FROM source_memberships").get().count, 1);
  after.close();
});

test("sync never treats an invalid discovered Skill as safe to prune", (t) => {
  const fixture = setup("invalid");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const skillRoot = join(fixture.repo, "skills", "invalid");
  makeSkill(skillRoot, "invalid-protected", "Valid before");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: InvalidProtected\ndescription: Invalid now\n---\n");
  commit(fixture.repo, "invalid metadata");

  const result = cli(["sync", "--all", "--prune", "--json"], fixture.options);
  assert.equal(result.status, 1);
  const source = JSON.parse(result.stdout).sources[0];
  assert.equal(source.failed.length, 1);
  assert.deepEqual(source.missing, []);
  assert.deepEqual(source.removed, []);
  assert.equal(existsSync(join(fixture.hub, "skills", "invalid-protected", "SKILL.md")), true);
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(db.prepare("SELECT status FROM source_memberships").get().status, "active");
  db.close();
});

test("sync treats a name change as an addition plus a missing Skill", (t) => {
  const fixture = setup("rename");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const skillRoot = join(fixture.repo, "skills", "renamed");
  makeSkill(skillRoot, "old-sync-name", "Before rename");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  makeSkill(skillRoot, "new-sync-name", "After rename");
  commit(fixture.repo, "rename");

  const result = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const source = JSON.parse(result.stdout).sources[0];
  assert.deepEqual(source.added.map((item) => item.name), ["new-sync-name"]);
  assert.deepEqual(source.missing.map((item) => item.name), ["old-sync-name"]);
  assert.equal(existsSync(join(fixture.hub, "skills", "new-sync-name", "SKILL.md")), true);
  assert.equal(existsSync(join(fixture.hub, "skills", "old-sync-name", "SKILL.md")), true);
});

test("explicit broader sync replaces a narrower source membership", (t) => {
  const fixture = setup("broader");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "one"), "broader-one", "First Skill");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills/one"], fixture.options).status, 0);
  makeSkill(join(fixture.repo, "skills", "two"), "broader-two", "Second Skill");
  commit(fixture.repo, "add sibling");

  const result = cli(["sync", fixture.url, "--path", "skills", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).sources[0].added.map((item) => item.name), ["broader-two"]);
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sources").get().count, 1);
  assert.deepEqual(db.prepare("SELECT scan_path FROM sources").all().map((row) => row.scan_path), ["skills"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM source_memberships").get().count, 2);
  db.close();
});

test("sync all continues after one registered source cannot be fetched", (t) => {
  const fixture = setup("fleet");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "healthy"), "fleet-healthy", "Before update");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  const brokenRepo = join(fixture.root, "broken-repo");
  mkdirSync(brokenRepo);
  git(["init"], brokenRepo);
  git(["branch", "-M", "main"], brokenRepo);
  makeSkill(join(brokenRepo, "skills", "broken"), "fleet-broken", "Broken source");
  commit(brokenRepo, "initial");
  const brokenUrl = pathToFileURL(brokenRepo).href;
  assert.equal(cli(["install", brokenUrl, "--path", "skills"], fixture.options).status, 0);
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("UPDATE sources SET location=? WHERE location=?")
    .run(pathToFileURL(join(fixture.root, "missing-repo")).href, brokenUrl);
  db.close();
  makeSkill(join(fixture.repo, "skills", "healthy"), "fleet-healthy", "After update");
  commit(fixture.repo, "update healthy");

  const result = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(result.status, 1);
  const value = JSON.parse(result.stdout);
  assert.equal(value.failed.length, 1);
  assert.match(value.failed[0].reason, /Git source failed/);
  assert.deepEqual(value.sources[0].updated.map((item) => item.name), ["fleet-healthy"]);
  assert.match(readFileSync(join(fixture.hub, "skills", "fleet-healthy", "SKILL.md"), "utf8"), /After update/);
  assert.match(readFileSync(join(fixture.hub, "skills", "fleet-broken", "SKILL.md"), "utf8"), /Broken source/);
});

test("sync validates source selection and destructive option combinations", (t) => {
  const fixture = setup("validation");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  assert.match(cli(["sync", "--dry-run"], fixture.options).stderr, /exactly one Git source or --all/);
  assert.match(cli(["sync", fixture.url, "--all"], fixture.options).stderr, /exactly one Git source or --all/);
  assert.match(cli(["sync", fixture.url, "--force"], fixture.options).stderr, /--force requires --prune/);
  assert.match(cli(["sync", "--all", "--path", "skills"], fixture.options).stderr, /cannot be combined with --all/);
});

function setup(name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-sync-${name}-`));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  mkdirSync(project);
  mkdirSync(repo);
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  return { root, hub, project, repo, url: pathToFileURL(repo).href, options };
}

function commit(repo, message) {
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", message], repo);
  return git(["rev-parse", "HEAD"], repo).stdout.trim();
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
