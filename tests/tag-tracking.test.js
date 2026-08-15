import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("install --track-tags resolves the highest stable tag matching the pattern", (t) => {
  const fixture = setupFixture("install");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  makeSkill(repo, "tracker", "Version 1.2.0");
  commitAll(repo, "v1.2.0");
  git(["tag", "v1.2.0"], repo);
  git(["tag", "latest"], repo);
  makeSkill(repo, "tracker", "Version 2.0.0 beta");
  commitAll(repo, "beta");
  git(["tag", "v2.0.0-beta"], repo);

  const result = cli(["install", pathToFileURL(repo).href, "--track-tags", "v*", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Version 1.2.0");
  assert.equal(skill.sourceRef, "v1.2.0");
  assert.equal(skill.sourceTracking, "tag-pattern");
  assert.equal(skill.sourceTagPattern, "v*");
  assert.equal(skill.sourceRevision, revisionOf(repo, "v1.2.0"));
});

test("install --track-tags only matches the requested tag series", (t) => {
  const fixture = setupFixture("series");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "series-skill", "CLI release");
  git(["init"], repo);
  commitAll(repo, "cli");
  git(["tag", "cli-v9.0.0"], repo);
  makeSkill(repo, "series-skill", "Skill release");
  commitAll(repo, "skill");
  git(["tag", "skill-v2.0.0"], repo);

  const result = cli(["install", pathToFileURL(repo).href, "--track-tags", "skill-v*", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const skill = JSON.parse(cli(["info", "series-skill"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Skill release");
  assert.equal(skill.sourceRef, "skill-v2.0.0");
});

test("tag-pattern skills check outdated, update to the new tag, then stay up-to-date", (t) => {
  const fixture = setupFixture("update");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  assert.equal(cli(["install", pathToFileURL(repo).href, "--track-tags", "v*"], fixture.options).status, 0);

  makeSkill(repo, "tracker", "Version 1.1.0");
  commitAll(repo, "v1.1.0");
  git(["tag", "-a", "v1.1.0", "-m", "release v1.1.0"], repo);
  const releaseRevision = git(["rev-parse", "v1.1.0^{}"], repo).stdout.trim();

  const check = cli(["update", "--all", "--check", "--json"], fixture.options);
  assert.equal(check.status, 0, check.stderr);
  const inspected = JSON.parse(check.stdout).updates[0];
  assert.equal(inspected.status, "outdated");
  assert.equal(inspected.sourceTracking, "tag-pattern");
  assert.equal(inspected.remoteRevision, releaseRevision);
  assert.equal(inspected.remoteRef, "v1.1.0");

  const result = cli(["update", "--all", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).updated, [{ name: "tracker", revision: releaseRevision }]);
  const skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Version 1.1.0");
  assert.equal(skill.sourceRef, "v1.1.0");
  assert.equal(skill.sourceRevision, releaseRevision);
  assert.equal(skill.sourceTracking, "tag-pattern");
  assert.equal(skill.sourceTagPattern, "v*");

  const recheck = cli(["update", "tracker", "--check", "--json"], fixture.options);
  assert.equal(recheck.status, 0, recheck.stderr);
  assert.equal(JSON.parse(recheck.stdout).update.status, "up-to-date");
  const again = cli(["update", "--all", "--json"], fixture.options);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(again.stdout).skipped, [{ name: "tracker", reason: "up-to-date" }]);
});

test("plain update refreshes a tag-pattern Skill without being blocked as pinned", (t) => {
  const fixture = setupFixture("plain");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  assert.equal(cli(["install", pathToFileURL(repo).href, "--track-tags", "v*"], fixture.options).status, 0);

  makeSkill(repo, "tracker", "Version 1.2.0");
  commitAll(repo, "v1.2.0");
  git(["tag", "v1.2.0"], repo);
  const result = cli(["update", "tracker", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Version 1.2.0");
  assert.equal(skill.sourceRef, "v1.2.0");
});

test("switching a tag-pattern Skill to a branch clears the pattern", (t) => {
  const fixture = setupFixture("retarget");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "tracker", "Version 1.0.0");
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  assert.equal(cli(["install", pathToFileURL(repo).href, "--track-tags", "v*"], fixture.options).status, 0);

  makeSkill(repo, "tracker", "Main snapshot");
  commitAll(repo, "main snapshot");
  const result = cli(["update", "tracker", "--ref", "main", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Main snapshot");
  assert.equal(skill.sourceRef, "main");
  assert.equal(skill.sourceTracking, "branch");
  assert.equal(skill.sourceTagPattern, null);
});

test("sync --all re-resolves a tag-pattern collection to the newest release", (t) => {
  const fixture = setupFixture("sync");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(join(repo, "skills", "tracker"), "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  const url = pathToFileURL(repo).href;

  const initial = cli(["sync", url, "--path", "skills", "--track-tags", "v*", "--json"], fixture.options);
  assert.equal(initial.status, 0, initial.stderr);
  let skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.sourceRef, "v1.0.0");
  assert.equal(skill.sourceTagPattern, "v*");

  makeSkill(join(repo, "skills", "tracker"), "tracker", "Version 1.1.0");
  commitAll(repo, "v1.1.0");
  git(["tag", "v1.1.0"], repo);
  const releaseRevision = revisionOf(repo, "v1.1.0");

  const preview = cli(["sync", "--all", "--dry-run", "--json"], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).sources[0].updated, [
    { name: "tracker", path: "skills/tracker", revision: releaseRevision }
  ]);

  const result = cli(["sync", "--all", "--json"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.equal(skill.description, "Version 1.1.0");
  assert.equal(skill.sourceRef, "v1.1.0");
  assert.equal(skill.sourceRevision, releaseRevision);
  assert.equal(skill.sourceTracking, "tag-pattern");
  assert.equal(skill.sourceTagPattern, "v*");
});

test("update check works when the stored location carries a sklp-path fragment", (t) => {
  const fixture = setupFixture("fragment");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(join(repo, "skills", "tracker"), "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);

  const install = cli(
    ["install", pathToFileURL(repo).href, "--path", "skills/tracker", "--track-tags", "v*"],
    fixture.options
  );
  assert.equal(install.status, 0, install.stderr);
  const skill = JSON.parse(cli(["info", "tracker"], fixture.options).stdout).skill;
  assert.match(skill.sourceLocation, /#sklp-path=/);

  const check = cli(["update", "tracker", "--check", "--json"], fixture.options);
  assert.equal(check.status, 0, check.stderr);
  const update = JSON.parse(check.stdout).update;
  assert.equal(update.status, "up-to-date");
  assert.equal(update.remoteRef, "v1.0.0");
});

test("--track-tags rejects invalid combinations and unmatched patterns", (t) => {
  const fixture = setupFixture("invalid");
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const repo = join(fixture.root, "repo");
  makeSkill(repo, "tracker", "Version 1.0.0");
  git(["init"], repo);
  commitAll(repo, "v1.0.0");
  git(["tag", "v1.0.0"], repo);
  const url = pathToFileURL(repo).href;

  const combinedRef = cli(["install", url, "--ref", "v1.0.0", "--track-tags", "v*"], fixture.options);
  assert.equal(combinedRef.status, 1);
  assert.match(combinedRef.stderr, /--ref cannot be combined with --track-tags/);

  const noMatch = cli(["install", url, "--track-tags", "nope-*"], fixture.options);
  assert.equal(noMatch.status, 1);
  assert.match(noMatch.stderr, /No remote tag matches --track-tags pattern: nope-\*/);

  const optionLike = cli(["install", url, "--track-tags=-v*"], fixture.options);
  assert.equal(optionLike.status, 1);
  assert.match(optionLike.stderr, /Invalid tag pattern/);

  assert.equal(cli(["install", url, "--track-tags", "v*"], fixture.options).status, 0);
  const withCheck = cli(["update", "tracker", "--track-tags", "v*", "--check"], fixture.options);
  assert.equal(withCheck.status, 1);
  assert.match(withCheck.stderr, /--track-tags cannot be combined with --check or --dry-run/);
  const syncAll = cli(["sync", "--all", "--track-tags", "v*"], fixture.options);
  assert.equal(syncAll.status, 1);
  assert.match(syncAll.stderr, /cannot be combined with --all/);
});

function setupFixture(name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-tag-tracking-${name}-`));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  return { root, hub, project, options };
}

function commitAll(repo, message) {
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", message], repo);
}

function revisionOf(repo, ref) {
  return git(["rev-parse", `${ref}^{}`], repo).stdout.trim();
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
