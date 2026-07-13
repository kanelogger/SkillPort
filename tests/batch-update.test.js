import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("batch check and dry-run return ordered plans without changing Hub or managed entries", (t) => {
  const fixture = setupFixture("preview");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installGitSkill(fixture, "alpha-git", "Before alpha");
  installGitSkill(fixture, "delta-tag", "Pinned delta", "v1");
  makeSkill(fixture.local, "beta-local", "Copied local Skill");
  assert.equal(cli(["install", fixture.local], fixture.options).status, 0);
  makeSkill(fixture.linked, "gamma-linked", "Linked local Skill");
  assert.equal(cli(["link", fixture.linked], fixture.options).status, 0);
  assert.equal(cli(["enable", "alpha-git"], fixture.options).status, 0);
  updateGitSkill(fixture.repos.get("alpha-git"), "alpha-git", "After alpha");

  const hubBefore = snapshotTree(fixture.hub);
  const managedBefore = snapshotTree(join(fixture.project, ".agents"));
  const check = cli(["update", "--all", "--check", "--json"], fixture.options);
  assert.equal(check.status, 0, check.stderr);
  const checked = JSON.parse(check.stdout);
  assert.deepEqual(checked.updates.map((update) => update.name), ["alpha-git", "beta-local", "delta-tag", "gamma-linked"]);
  assert.equal(checked.updates[0].status, "outdated");
  assert.deepEqual(checked.updates.slice(1).map((update) => [update.status, update.reason]), [
    ["skipped", "local-copied"],
    ["pinned", undefined],
    ["skipped", "linked"]
  ]);
  const chinese = cli(["update", "--all", "--check"], { ...fixture.options, env: { SKLP_LANG: "zh-CN" } });
  assert.equal(chinese.status, 0, chinese.stderr);
  assert.match(chinese.stdout, /更新检查 alpha-git: outdated/);

  const preview = cli(["update", "--all", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.deepEqual(plan.planned.map((item) => item.name), ["alpha-git"]);
  assert.equal(plan.planned[0].revision, git(["rev-parse", "HEAD"], fixture.repos.get("alpha-git")).stdout.trim());
  assert.deepEqual(plan.skipped.map((item) => [item.name, item.reason]), [
    ["beta-local", "local-copied"],
    ["delta-tag", "pinned"],
    ["gamma-linked", "linked"]
  ]);
  assert.deepEqual(plan.failed, []);

  const onePreview = cli(["update", "alpha-git", "--dry-run", "--json"], fixture.options);
  assert.equal(onePreview.status, 0, onePreview.stderr);
  assert.deepEqual(JSON.parse(onePreview.stdout).planned, plan.planned);
  assert.deepEqual(snapshotTree(fixture.hub), hubBefore);
  assert.deepEqual(snapshotTree(join(fixture.project, ".agents")), managedBefore);
});

test("batch update uses resolved revisions, preserves a failed Skill, and continues", (t) => {
  const fixture = setupFixture("apply");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installGitSkill(fixture, "alpha-git", "Before alpha");
  installGitSkill(fixture, "bravo-git", "Before bravo");
  installGitSkill(fixture, "charlie-git", "Before charlie");
  makeSkill(fixture.local, "delta-local", "Copied local Skill");
  assert.equal(cli(["install", fixture.local], fixture.options).status, 0);
  makeSkill(fixture.linked, "echo-linked", "Linked local Skill");
  assert.equal(cli(["link", fixture.linked], fixture.options).status, 0);
  assert.equal(cli(["enable", "bravo-git"], fixture.options).status, 0);
  const alphaRevision = updateGitSkill(fixture.repos.get("alpha-git"), "alpha-git", "After alpha");
  updateGitSkill(fixture.repos.get("bravo-git"), "renamed-git", "Broken bravo");
  const charlieRevision = updateGitSkill(fixture.repos.get("charlie-git"), "charlie-git", "After charlie");

  const result = cli(["update", "--all", "--json"], fixture.options);
  assert.equal(result.status, 1, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary.updated, [
    { name: "alpha-git", revision: alphaRevision },
    { name: "charlie-git", revision: charlieRevision }
  ]);
  assert.deepEqual(summary.skipped, [
    { name: "delta-local", reason: "local-copied" },
    { name: "echo-linked", reason: "linked" }
  ]);
  assert.deepEqual(summary.failed.map((item) => item.name), ["bravo-git"]);
  assert.match(summary.failed[0].reason, /Updated Skill name changed/);

  const alpha = JSON.parse(cli(["info", "alpha-git"], fixture.options).stdout).skill;
  const bravo = JSON.parse(cli(["info", "bravo-git"], fixture.options).stdout);
  const charlie = JSON.parse(cli(["info", "charlie-git"], fixture.options).stdout).skill;
  assert.equal(alpha.description, "After alpha");
  assert.equal(alpha.sourceRevision, alphaRevision);
  assert.equal(bravo.skill.description, "Before bravo");
  assert.equal(bravo.enablements[0].health, "healthy");
  assert.equal(charlie.description, "After charlie");
  assert.equal(charlie.sourceRevision, charlieRevision);
});

test("batch check reports an unknown legacy source with a nonzero JSON result", (t) => {
  const fixture = setupFixture("unknown");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "unknown-git-repo");
  makeSkill(repo, "unknown-git", "Legacy branch");
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], repo);
  git(["tag", "main"], repo);
  assert.equal(cli(["install", pathToFileURL(repo).href, "--ref", "main"], fixture.options).status, 0);
  const database = new DatabaseSync(join(fixture.hub, "state.db"));
  database.prepare("UPDATE skills SET source_tracking=NULL WHERE name=?").run("unknown-git");
  database.close();

  const result = cli(["update", "--all", "--check", "--json"], fixture.options);
  assert.equal(result.status, 1, result.stderr);
  const update = JSON.parse(result.stdout).updates[0];
  assert.equal(update.status, "unknown");
  assert.equal(update.sourceTracking, "unknown");
  assert.match(update.reason, /both a branch and a tag/);
});

test("batch update recovers an interrupted sibling and retains completed updates", (t) => {
  const fixture = setupFixture("recovery");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installGitSkill(fixture, "alpha-git", "Before alpha");
  installGitSkill(fixture, "bravo-git", "Before bravo");
  const alphaRevision = updateGitSkill(fixture.repos.get("alpha-git"), "alpha-git", "After alpha");
  assert.equal(cli(["update", "alpha-git"], fixture.options).status, 0);
  const bravoRevision = updateGitSkill(fixture.repos.get("bravo-git"), "bravo-git", "After bravo");
  const bravo = JSON.parse(cli(["info", "bravo-git"], fixture.options).stdout).skill;
  const database = new DatabaseSync(join(fixture.hub, "state.db"));
  database.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("interrupted-bravo", "update", "started", JSON.stringify({
      kind: "update",
      skill: bravo,
      destination: join(fixture.hub, "skills", "bravo-git"),
      backup: join(fixture.hub, ".staging", "interrupted-bravo-backup")
    }), new Date().toISOString());
  database.close();

  const result = cli(["update", "--all", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).updated, [{ name: "bravo-git", revision: bravoRevision }]);
  assert.equal(JSON.parse(cli(["info", "alpha-git"], fixture.options).stdout).skill.sourceRevision, alphaRevision);
  assert.equal(JSON.parse(cli(["info", "bravo-git"], fixture.options).stdout).skill.sourceRevision, bravoRevision);
});

function setupFixture(name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-batch-${name}-`));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const local = join(root, "local");
  const linked = join(root, "linked");
  mkdirSync(project);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  return { root, hub, project, local, linked, options, repos: new Map() };
}

function installGitSkill(fixture, name, description, ref) {
  const repo = join(fixture.root, `${name}-repo`);
  makeSkill(repo, name, description);
  git(["init"], repo);
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], repo);
  if (ref) git(["tag", ref], repo);
  const args = ["install", pathToFileURL(repo).href];
  if (ref) args.push("--ref", ref);
  assert.equal(cli(args, fixture.options).status, 0);
  fixture.repos.set(name, repo);
}

function updateGitSkill(repo, name, description) {
  makeSkill(repo, name, description);
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], repo);
  return git(["rev-parse", "HEAD"], repo).stdout.trim();
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function snapshotTree(root, prefix = "") {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relative = join(prefix, entry.name);
      const path = join(root, entry.name);
      if (entry.isDirectory()) return snapshotTree(path, relative);
      if (entry.isSymbolicLink()) return [[relative, "symlink", readlinkSync(path)]];
      assert.equal(lstatSync(path).isFile(), true, `Unexpected entry in snapshot: ${relative}`);
      return [[relative, "file", readFileSync(path).toString("base64")]];
    });
}
