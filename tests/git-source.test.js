import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("Git install records a revision and supports an explicit commit", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "git-skill", "From Git");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  const commit = git(["rev-parse", "HEAD"], source).stdout.trim();
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", pathToFileURL(source).href, "--ref", commit], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(cli(["info", "git-skill"], { cwd: project, hub, home: root }).stdout);
  assert.equal(info.skill.sourceType, "git");
  assert.equal(info.skill.sourceRevision, commit);
});

test("Git refs that look like command options are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-ref-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  const result = cli(["install", "https://example.invalid/repo.git", "--ref=-upload-pack=evil"], {
    cwd: project,
    hub,
    home: root
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid Git ref/);
});

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
