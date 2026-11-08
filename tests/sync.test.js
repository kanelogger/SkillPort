import assert from "node:assert/strict";
import {
  cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync
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
  makeSkill(join(fixture.repo, "skills", "alpha", "assets", "fixtures", "nested"), "nested-fixture", "Embedded fixture");
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
  assert.equal(existsSync(join(fixture.hub, "skills", "nested-fixture")), false);
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

test("explicit sync repairs a moved single-path Git Skill without reinstalling it", (t) => {
  const fixture = setup("moved-skill");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const oldPath = "skills/moved";
  const newPath = "skills/editing/moved";
  const github = "https://github.com/owner/moved-skills";
  writeFileSync(join(fixture.root, ".gitconfig"), [
    `[url "${fixture.url}"]`, `  insteadOf = ${github}.git`, `  insteadOf = ${github}`, ""
  ].join("\n"));
  makeSkill(join(fixture.repo, oldPath), "moved-skill", "Before move");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", github, "--path", oldPath], fixture.options).status, 0);
  assert.equal(cli(["tag", "add", "editing", "moved-skill"], fixture.options).status, 0);
  assert.equal(cli(["enable", "moved-skill"], fixture.options).status, 0);
  assert.equal(cli(["enable", "moved-skill", "--global"], fixture.options).status, 0);
  const before = JSON.parse(cli(["info", "moved-skill"], fixture.options).stdout);

  mkdirSync(join(fixture.repo, "skills", "editing"));
  renameSync(join(fixture.repo, oldPath), join(fixture.repo, newPath));
  makeSkill(join(fixture.repo, newPath), "moved-skill", "After move");
  makeSkill(join(fixture.repo, "skills", "sibling"), "untouched-sibling", "Outside requested scope");
  const revision = commit(fixture.repo, "move to a category");
  assert.equal(cli(["update", "moved-skill"], fixture.options).status, 1);
  const oldScope = cli(["sync", "--all", "--dry-run", "--json"], fixture.options);
  assert.equal(oldScope.status, 0, oldScope.stdout || oldScope.stderr);
  assert.deepEqual(JSON.parse(oldScope.stdout).sources[0].missing, [{
    name: "moved-skill", path: oldPath, enabled: true, action: "retain"
  }]);

  const args = ["sync", `${github}.git`, "--path", newPath, "--json"];
  const differentRef = cli([...args, "--ref", "main", "--dry-run"], fixture.options);
  assert.equal(differentRef.status, 1, differentRef.stdout || differentRef.stderr);
  assert.match(JSON.parse(differentRef.stdout).failed[0].reason, /another source/);
  const preview = cli([...args, "--dry-run"], fixture.options);
  assert.equal(preview.status, 0, preview.stdout || preview.stderr);
  const plan = JSON.parse(preview.stdout).sources[0];
  assert.deepEqual(plan.updated, [{ name: "moved-skill", path: newPath, revision }]);
  assert.deepEqual(plan.added, []);
  assert.deepEqual(JSON.parse(cli(["info", "moved-skill"], fixture.options).stdout), before);

  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.exec(`
    CREATE TRIGGER fail_membership BEFORE INSERT ON source_memberships
    WHEN NEW.skill_path = 'skills/editing/moved' BEGIN
      SELECT RAISE(ABORT, 'membership write failed');
    END
  `);
  const rejected = cli(args, fixture.options);
  assert.equal(rejected.status, 1, rejected.stdout || rejected.stderr);
  assert.match(JSON.parse(rejected.stdout).failed[0].reason, /membership write failed/);
  assert.deepEqual(JSON.parse(cli(["info", "moved-skill"], fixture.options).stdout), before);
  assert.match(readFileSync(join(fixture.hub, "skills", "moved-skill", "SKILL.md"), "utf8"), /Before move/);
  db.exec("DROP TRIGGER fail_membership");

  const savedBackup = join(fixture.root, "saved-backup");
  cpSync(join(fixture.hub, "skills", "moved-skill"), savedBackup, { recursive: true });
  const applied = cli(args, fixture.options);
  assert.equal(applied.status, 0, applied.stdout || applied.stderr);
  assert.deepEqual(JSON.parse(applied.stdout).sources[0].updated, plan.updated);
  const after = JSON.parse(cli(["info", "moved-skill"], fixture.options).stdout);
  assert.equal(after.skill.instanceId, before.skill.instanceId);
  assert.deepEqual(after.skill.tags, ["editing"]);
  assert.deepEqual(after.enablements, before.enablements);
  assert.equal(after.skill.sourceLocation, `${github}.git#sklp-path=${encodeURIComponent(newPath)}`);
  assert.deepEqual(db.prepare("SELECT scan_path FROM sources").all().map((row) => row.scan_path), [newPath]);
  assert.equal(db.prepare("SELECT skill_path FROM source_memberships").get().skill_path, newPath);

  const operation = db.prepare("SELECT id, payload_json FROM operations WHERE kind='update' AND status='completed'").get();
  const recovery = JSON.parse(operation.payload_json);
  assert.equal(recovery.committed, true);
  renameSync(savedBackup, recovery.backup);
  db.prepare("UPDATE operations SET status='started', finished_at=NULL WHERE id=?").run(operation.id);
  const recovered = cli(["info", "moved-skill"], fixture.options);
  assert.equal(recovered.status, 0, recovered.stdout || recovered.stderr);
  assert.deepEqual(JSON.parse(recovered.stdout), after);
  assert.equal(existsSync(recovery.backup), false);
  assert.equal(db.prepare("SELECT status FROM operations WHERE id=?").get(operation.id).status, "completed");
  db.close();

  makeSkill(join(fixture.repo, newPath), "moved-skill", "Subsequent update");
  commit(fixture.repo, "update moved Skill");
  assert.equal(cli(["update", "moved-skill"], fixture.options).status, 0);
  const fleet = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(fleet.status, 0, fleet.stdout || fleet.stderr);
  assert.deepEqual(JSON.parse(fleet.stdout).sources[0].unchanged.map((item) => item.name), ["moved-skill"]);
});

test("explicit sync updates the selected path even at the same Git revision", (t) => {
  const fixture = setup("same-revision");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "old"), "same-revision", "Same metadata");
  makeSkill(join(fixture.repo, "new"), "same-revision", "Same metadata");
  writeFileSync(join(fixture.repo, "new", "content.txt"), "Content from the selected path");
  const revision = commit(fixture.repo, "both paths");
  assert.equal(cli(["install", fixture.url, "--path", "old", "--ref", revision], fixture.options).status, 0);
  assert.equal(cli(["sync", "--forget", fixture.url, "--path", "old", "--ref", revision], fixture.options).status, 0);
  const result = cli(["sync", fixture.url, "--path", "new", "--ref", revision, "--json"], fixture.options);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).sources[0].updated, [{ name: "same-revision", path: "new", revision }]);
  assert.equal(readFileSync(join(fixture.hub, "skills", "same-revision", "content.txt"), "utf8"), "Content from the selected path");
});

test("sync --skip-existing preserves Skills managed outside the collection", (t) => {
  const fixture = setup("skip-existing");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const external = join(fixture.root, "external");
  makeSkill(external, "shared-skill", "Externally managed");
  assert.equal(cli(["install", external], fixture.options).status, 0);
  makeSkill(join(fixture.repo, "skills", "shared"), "shared-skill", "Collection copy");
  makeSkill(join(fixture.repo, "skills", "unique"), "unique-skill", "Collection member");
  commit(fixture.repo, "collection");

  const installed = cli([
    "install", fixture.url, "--path", "skills", "--skip-existing", "--json"
  ], fixture.options);
  assert.equal(installed.status, 0, installed.stderr);
  assert.deepEqual(JSON.parse(installed.stdout).skills.map((skill) => skill.name), ["unique-skill"]);

  const strict = cli(["sync", "--all", "--dry-run", "--json"], fixture.options);
  assert.equal(strict.status, 1);
  const strictSummary = JSON.parse(strict.stdout);
  assert.deepEqual(strictSummary.sources[0].failed.map((item) => item.name), ["shared-skill"]);
  assert.deepEqual(strictSummary.failed, [{
    source: strictSummary.sources[0].source.location, scanPath: "skills", ref: null,
    ...strictSummary.sources[0].failed[0]
  }]);

  const preview = cli(["sync", "--all", "--skip-existing", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).sources[0].skipped, [{
    name: "shared-skill",
    path: "skills/shared",
    reason: "already-installed"
  }]);
  assert.deepEqual(JSON.parse(preview.stdout).sources[0].failed, []);

  const applied = cli(["sync", "--all", "--skip-existing", "--json"], fixture.options);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(JSON.parse(applied.stdout).sources[0].skipped, [{
    name: "shared-skill",
    path: "skills/shared",
    reason: "already-installed"
  }]);
  assert.match(readFileSync(join(fixture.hub, "skills", "shared-skill", "SKILL.md"), "utf8"), /Externally managed/);

  const chinese = cli(["sync", "--all", "--skip-existing", "--dry-run"], {
    ...fixture.options,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(chinese.status, 0, chinese.stderr);
  assert.match(chinese.stdout, /已跳过 shared-skill：已由其他来源安装或管理/);
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
  const invalidRoot = join(fixture.repo, "skills", "invalid");
  makeSkill(invalidRoot, "fleet-invalid", "Placeholder");
  writeFileSync(join(invalidRoot, "SKILL.md"), "---\nname: fleet-invalid\ndescription: Invalid YAML: detail\n---\n");
  commit(fixture.repo, "update healthy");

  const result = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(result.status, 1);
  const value = JSON.parse(result.stdout);
  assert.equal(value.failed.length, 2);
  assert.match(value.failed[0].reason, /Git source failed/);
  assert.deepEqual(value.failed[1], {
    source: value.sources[0].source.location, scanPath: "skills", ref: null,
    ...value.sources[0].failed[0]
  });
  assert.equal(value.failed[1].path, "skills/invalid");
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

test("removing the last member deregisters the source and sync --all no longer fetches it", (t) => {
  const fixture = setup("orphan-source");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "solo"), "solo-skill", "Solo upstream Skill");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  let state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 1);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 1);
  state.close();

  assert.equal(cli(["remove", "solo-skill"], fixture.options).status, 0);
  state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 0);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 0);
  state.close();

  rmSync(fixture.repo, { recursive: true, force: true });
  const synced = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(synced.status, 0, synced.stderr);
  assert.deepEqual(JSON.parse(synced.stdout), { sources: [], failed: [] });
  assert.equal(cli(["info", "solo-skill"], fixture.options).status, 1);
});

test("removing one member of a multi-member collection keeps the source registration", (t) => {
  const fixture = setup("multi-member-remove");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "alpha"), "alpha-skill", "Alpha upstream Skill");
  makeSkill(join(fixture.repo, "skills", "beta"), "beta-skill", "Beta upstream Skill");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);

  assert.equal(cli(["remove", "alpha-skill"], fixture.options).status, 0);
  const state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 1);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 1);
  state.close();
});

test("sync prune removing the last member cleans up the source registration", (t) => {
  const fixture = setup("prune-orphan-source");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "solo"), "prune-solo", "Prune me");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  rmSync(join(fixture.repo, "skills"), { recursive: true });
  commit(fixture.repo, "delete skills");

  const pruned = cli(["sync", "--all", "--prune", "--json"], fixture.options);
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.deepEqual(JSON.parse(pruned.stdout).sources[0].removed, [{ name: "prune-solo" }]);
  const state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 0);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 0);
  state.close();
});

test("sync --forget preview is read-only and apply keeps installed Skills", (t) => {
  const fixture = setup("forget-preview-apply");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "solo"), "forget-skill", "Keep me installed");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  assert.equal(cli(["enable", "forget-skill"], fixture.options).status, 0);

  const preview = cli(["sync", "--forget", fixture.url, "--path", "skills", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    dryRun: true,
    forgotten: {
      source: { location: fixture.url, ref: null, tagPattern: null, path: "skills" },
      retained: [{ name: "forget-skill" }]
    }
  });
  let state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 1);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 1);
  state.close();

  const applied = cli(["sync", "--forget", fixture.url, "--path", "skills", "--json"], fixture.options);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(JSON.parse(applied.stdout), {
    forgotten: {
      source: { location: fixture.url, ref: null, tagPattern: null, path: "skills" },
      retained: [{ name: "forget-skill" }]
    }
  });
  state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 0);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 0);
  state.close();
  const info = JSON.parse(cli(["info", "forget-skill"], fixture.options).stdout);
  assert.equal(info.skill.name, "forget-skill");
  assert.equal(info.enablements.length, 1);
  assert.equal(info.enablements[0].health, "healthy");
  assert.equal(existsSync(join(fixture.hub, "skills", "forget-skill", "SKILL.md")), true);
  const catalog = JSON.parse(readFileSync(join(fixture.hub, "catalog.json"), "utf8"));
  assert.equal(catalog.skills[0].name, "forget-skill");
});

test("sync --forget works without a reachable remote and removes only the exact scope", (t) => {
  const fixture = setup("forget-scopes");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "one", "alpha"), "alpha-skill", "Scope one");
  makeSkill(join(fixture.repo, "two", "beta"), "beta-skill", "Scope two");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "one"], fixture.options).status, 0);
  assert.equal(cli(["install", fixture.url, "--path", "two"], fixture.options).status, 0);
  rmSync(fixture.repo, { recursive: true, force: true });

  const preview = cli(["sync", "--forget", fixture.url, "--path", "one", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    dryRun: true,
    forgotten: {
      source: { location: fixture.url, ref: null, tagPattern: null, path: "one" },
      retained: [{ name: "alpha-skill" }]
    }
  });
  const applied = cli(["sync", "--forget", fixture.url, "--path", "one", "--json"], fixture.options);
  assert.equal(applied.status, 0, applied.stderr);
  const state = new DatabaseSync(join(fixture.hub, "state.db"));
  const sources = state.prepare("SELECT scan_path FROM sources ORDER BY scan_path").all();
  assert.deepEqual(sources.map((row) => row.scan_path), ["two"]);
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM source_memberships").get().c, 1);
  state.close();
  assert.equal(cli(["info", "alpha-skill"], fixture.options).status, 0);
  assert.equal(cli(["info", "beta-skill"], fixture.options).status, 0);
});

test("sync --forget rejects unregistered scopes and destructive combinations", (t) => {
  const fixture = setup("forget-validation");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "solo"), "solo-skill", "Solo");
  commit(fixture.repo, "initial");
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);

  const missing = cli(["sync", "--forget", fixture.url, "--path", "other"], fixture.options);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /No registered source collection matches/);
  assert.match(cli(["sync", "--forget"], fixture.options).stderr, /--forget requires a Git source/);
  assert.match(cli(["sync", "--forget", fixture.url, "--all"], fixture.options).stderr, /--forget cannot be combined with --all/);
  assert.match(
    cli(["sync", "--forget", fixture.url, "--prune"], fixture.options).stderr,
    /--prune, --force, and --skip-existing cannot be combined with --forget/
  );
  assert.match(
    cli(["sync", "--forget", fixture.url, "--force"], fixture.options).stderr,
    /--prune, --force, and --skip-existing cannot be combined with --forget/
  );
  assert.match(
    cli(["sync", "--forget", fixture.url, "--skip-existing"], fixture.options).stderr,
    /--prune, --force, and --skip-existing cannot be combined with --forget/
  );
  assert.match(
    cli(["sync", "--forget", fixture.url, "--ref", "x", "--track-tags", "y"], fixture.options).stderr,
    /--ref cannot be combined with --track-tags/
  );
  const state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 1);
  state.close();
});

test("sync --forget removes only the exact ref scope on the same URL and path", (t) => {
  const fixture = setup("forget-ref-scope");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "alpha"), "alpha-skill", "Ref v1 member");
  commit(fixture.repo, "v1 content");
  git(["tag", "v1"], fixture.repo);
  rmSync(join(fixture.repo, "skills", "alpha"), { recursive: true });
  makeSkill(join(fixture.repo, "skills", "beta"), "beta-skill", "Main member");
  commit(fixture.repo, "main content");

  assert.equal(cli(["install", fixture.url, "--path", "skills", "--ref", "v1"], fixture.options).status, 0);
  assert.equal(cli(["install", fixture.url, "--path", "skills", "--ref", "main"], fixture.options).status, 0);
  let state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 2);
  state.close();

  const wrong = cli(["sync", "--forget", fixture.url, "--path", "skills", "--ref", "missing"], fixture.options);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /No registered source collection matches/);

  const forgotten = cli(["sync", "--forget", fixture.url, "--path", "skills", "--ref", "v1", "--json"], fixture.options);
  assert.equal(forgotten.status, 0, forgotten.stderr);
  assert.deepEqual(JSON.parse(forgotten.stdout), {
    forgotten: {
      source: { location: fixture.url, ref: "v1", tagPattern: null, path: "skills" },
      retained: [{ name: "alpha-skill" }]
    }
  });
  state = new DatabaseSync(join(fixture.hub, "state.db"));
  const sources = state.prepare("SELECT source_ref, scan_path FROM sources ORDER BY source_ref").all();
  assert.deepEqual(sources.map((row) => ({ ...row })), [{ source_ref: "main", scan_path: "skills" }]);
  state.close();
  assert.equal(cli(["info", "alpha-skill"], fixture.options).status, 0);
  assert.equal(cli(["info", "beta-skill"], fixture.options).status, 0);
});

test("sync --forget isolates tag-pattern scopes from plain scopes and records the operation", (t) => {
  const fixture = setup("forget-tag-scope");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  makeSkill(join(fixture.repo, "skills", "old"), "tag-scope-skill", "Tag pattern member");
  commit(fixture.repo, "tagged content");
  git(["tag", "skill-v1.0.0"], fixture.repo);
  rmSync(join(fixture.repo, "skills", "old"), { recursive: true });
  makeSkill(join(fixture.repo, "skills", "plain"), "plain-scope-skill", "Plain scope member");
  commit(fixture.repo, "plain content");

  assert.equal(cli(["install", fixture.url, "--path", "skills", "--track-tags", "skill-v*"], fixture.options).status, 0);
  assert.equal(cli(["install", fixture.url, "--path", "skills"], fixture.options).status, 0);
  let state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM sources").get().c, 2);
  state.close();

  const preview = cli(
    ["sync", "--forget", fixture.url, "--path", "skills", "--track-tags", "skill-v*", "--dry-run", "--json"],
    fixture.options
  );
  assert.equal(preview.status, 0, preview.stderr);
  state = new DatabaseSync(join(fixture.hub, "state.db"));
  assert.equal(state.prepare("SELECT COUNT(*) AS c FROM operations WHERE kind='sync-forget'").get().c, 0);
  state.close();

  const forgotten = cli(
    ["sync", "--forget", fixture.url, "--path", "skills", "--track-tags", "skill-v*", "--json"],
    fixture.options
  );
  assert.equal(forgotten.status, 0, forgotten.stderr);
  const result = JSON.parse(forgotten.stdout);
  assert.equal(result.forgotten.source.tagPattern, "skill-v*");
  assert.deepEqual(result.forgotten.retained, [{ name: "tag-scope-skill" }]);

  state = new DatabaseSync(join(fixture.hub, "state.db"));
  const sources = state.prepare("SELECT source_ref, source_tag_pattern FROM sources").all();
  assert.deepEqual(sources.map((row) => ({ ...row })), [{ source_ref: null, source_tag_pattern: null }]);
  const ops = state.prepare("SELECT kind, status FROM operations WHERE kind='sync-forget'").all();
  assert.deepEqual(ops.map((row) => ({ ...row })), [{ kind: "sync-forget", status: "completed" }]);
  state.close();
  assert.equal(cli(["info", "tag-scope-skill"], fixture.options).status, 0);
  assert.equal(cli(["info", "plain-scope-skill"], fixture.options).status, 0);
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
