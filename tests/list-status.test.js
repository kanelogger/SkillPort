import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("list --status reports copy, link, enablement, and health without paths", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-list-status-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const copiedSource = join(root, "copied-source");
  const gitSource = join(root, "git-source");
  const linkedSource = join(root, "linked-source");
  mkdirSync(project);
  makeSkill(copiedSource, "copied-status", "Copied status Skill");
  makeSkill(gitSource, "git-status", "Git status Skill");
  execFileSync("git", ["init", "-b", "main"], { cwd: gitSource });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: gitSource });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: gitSource });
  execFileSync("git", ["add", "SKILL.md"], { cwd: gitSource });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: gitSource });
  makeSkill(linkedSource, "linked-status", "Linked status Skill");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", copiedSource], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(gitSource).href], options).status, 0);
  assert.equal(cli(["link", linkedSource], options).status, 0);
  assert.equal(cli(["enable", "copied-status"], options).status, 0);

  const human = cli(["list", "--status"], options);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^NAME\tKIND\tENABLED\tHEALTH\tDESCRIPTION\tTAGS/m);
  assert.match(human.stdout, /copied-status\tlocal-copy\t1\thealthy\tCopied status Skill/);
  assert.match(human.stdout, /git-status\tgit-copy\t0\tnot-enabled\tGit status Skill/);
  assert.match(human.stdout, /linked-status\tlinked\t0\tnot-enabled\tLinked status Skill/);
  assert.equal(human.stdout.includes(root), false);

  const listed = cli(["list", "--status", "--json"], options);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stderr, "");
  const payload = JSON.parse(listed.stdout);
  assert.deepEqual(payload.skills.map((skill) => ({
    name: skill.name,
    installationKind: skill.installationKind,
    enablementCount: skill.enablementCount,
    health: skill.health
  })), [
    { name: "copied-status", installationKind: "local-copy", enablementCount: 1, health: "healthy" },
    { name: "git-status", installationKind: "git-copy", enablementCount: 0, health: "not-enabled" },
    { name: "linked-status", installationKind: "linked", enablementCount: 0, health: "not-enabled" }
  ]);
  assert.deepEqual(Object.keys(payload.skills[0]).sort(), [
    "description", "enablementCount", "health", "installationKind", "instanceId", "name", "tags"
  ]);
  assert.equal(listed.stdout.includes(project), false);
  assert.equal(listed.stdout.includes(copiedSource), false);
  assert.equal(listed.stdout.includes(gitSource), false);
  assert.equal(listed.stdout.includes(linkedSource), false);

  rmSync(join(project, ".agents", "skills", "copied-status"));
  const drifted = JSON.parse(cli(["list", "--status", "--json"], options).stdout);
  assert.equal(drifted.skills.find((skill) => skill.name === "copied-status").health, "missing");
});
