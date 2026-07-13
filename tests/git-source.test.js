import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
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
  assert.equal(info.skill.sourceTracking, "commit");
});

test("Git update check reports an up-to-date default branch without changing the stored revision", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-check-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "checked-git-skill", "From Git");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  const commit = git(["rev-parse", "HEAD"], source).stdout.trim();
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(source).href], options).status, 0);
  assert.equal(cli(["enable", "checked-git-skill"], options).status, 0);
  const hubBefore = snapshotTree(hub);
  const managedBefore = snapshotTree(join(project, ".agents"));

  const check = cli(["update", "checked-git-skill", "--check", "--json"], options);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), {
    update: {
      name: "checked-git-skill",
      status: "up-to-date",
      sourceTracking: "default-branch",
      currentRevision: commit,
      remoteRevision: commit
    }
  });
  const info = JSON.parse(cli(["info", "checked-git-skill"], options).stdout);
  assert.equal(info.skill.sourceRevision, commit);
  assert.deepEqual(snapshotTree(hub), hubBefore);
  assert.deepEqual(snapshotTree(join(project, ".agents")), managedBefore);
});

test("Git update check reports an outdated named branch", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-check-branch-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "branch-git-skill", "Before branch update");
  git(["init"], source);
  git(["branch", "-M", "main"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  const initial = git(["rev-parse", "HEAD"], source).stdout.trim();
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(source).href, "--ref", "main"], options).status, 0);

  makeSkill(source, "branch-git-skill", "After branch update");
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], source);
  const remote = git(["rev-parse", "HEAD"], source).stdout.trim();

  const check = cli(["update", "branch-git-skill", "--check", "--json"], options);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), {
    update: {
      name: "branch-git-skill",
      status: "outdated",
      sourceTracking: "branch",
      currentRevision: initial,
      remoteRevision: remote
    }
  });
});

test("Git update check keeps explicit commit selections pinned", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-check-pins-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "commit-pinned-skill", "Commit pin");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  const commit = git(["rev-parse", "HEAD"], source).stdout.trim();
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(source).href, "--ref", commit], options).status, 0);

  const commitCheck = cli(["update", "commit-pinned-skill", "--check", "--json"], options);
  assert.equal(commitCheck.status, 0, commitCheck.stderr);
  assert.deepEqual(JSON.parse(commitCheck.stdout), {
    update: {
      name: "commit-pinned-skill",
      status: "pinned",
      sourceTracking: "commit",
      currentRevision: commit,
      remoteRevision: null
    }
  });
});

test("Git update check keeps explicit tag selections pinned", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-check-tag-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "tag-pinned-skill", "Tag pin");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  const commit = git(["rev-parse", "HEAD"], source).stdout.trim();
  git(["tag", "v1"], source);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(source).href, "--ref", "v1"], options).status, 0);

  const info = JSON.parse(cli(["info", "tag-pinned-skill"], options).stdout);
  assert.equal(info.skill.sourceTracking, "tag");
  const check = cli(["update", "tag-pinned-skill", "--check", "--json"], options);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), {
    update: {
      name: "tag-pinned-skill",
      status: "pinned",
      sourceTracking: "tag",
      currentRevision: commit,
      remoteRevision: null
    }
  });
});

test("Git update check returns unknown for an ambiguous legacy ref without exposing credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-check-unknown-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  makeSkill(source, "legacy-ambiguous-skill", "Legacy ref");
  git(["init"], source);
  git(["branch", "-M", "main"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  git(["tag", "main"], source);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", pathToFileURL(source).href, "--ref", "main"], options).status, 0);
  const db = new DatabaseSync(join(hub, "state.db"));
  db.prepare("UPDATE skills SET source_tracking=NULL WHERE name=?").run("legacy-ambiguous-skill");
  db.close();

  const ambiguous = cli(["update", "legacy-ambiguous-skill", "--check", "--json"], options);
  assert.equal(ambiguous.status, 1, ambiguous.stderr);
  const ambiguousUpdate = JSON.parse(ambiguous.stdout).update;
  assert.equal(ambiguousUpdate.status, "unknown");
  assert.equal(ambiguousUpdate.sourceTracking, "unknown");
  assert.match(ambiguousUpdate.reason, /both a branch and a tag/);

  const credentialDb = new DatabaseSync(join(hub, "state.db"));
  credentialDb.prepare("UPDATE skills SET source_location=? WHERE name=?")
    .run("https://user:secret@127.0.0.1:1/repo.git", "legacy-ambiguous-skill");
  credentialDb.close();
  const inaccessible = cli(["update", "legacy-ambiguous-skill", "--check", "--json"], options);
  assert.equal(inaccessible.status, 1, inaccessible.stderr);
  const inaccessibleUpdate = JSON.parse(inaccessible.stdout).update;
  assert.equal(inaccessibleUpdate.status, "unknown");
  assert.equal(inaccessibleUpdate.reason.includes("secret"), false);
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

test("Git install can target a Skill subdirectory", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-path-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(join(source, "skills", "writer"), "git-path-skill", "From a Git subdirectory");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", pathToFileURL(source).href, "--path", "skills/writer"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(cli(["info", "git-path-skill"], { cwd: project, hub, home: root }).stdout);
  assert.equal(info.skill.sourceType, "git");
  assert.match(info.skill.sourceLocation, /#sklp-path=skills%2Fwriter$/);
});

test("Git subdirectory installs preserve update behavior", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-path-update-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  const skill = join(source, "skills", "writer");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(skill, "git-path-update", "Before update");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  cli(["init"], { cwd: project, hub, home: root });
  assert.equal(cli(["install", pathToFileURL(source).href, "--path", "skills/writer"], { cwd: project, hub, home: root }).status, 0);

  makeSkill(skill, "git-path-update", "After update");
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], source);
  const updated = cli(["update", "git-path-update"], { cwd: project, hub, home: root });
  assert.equal(updated.status, 0, updated.stderr);
  const info = JSON.parse(cli(["info", "git-path-update"], { cwd: project, hub, home: root }).stdout);
  assert.equal(info.skill.description, "After update");
});

test("GitHub tree URLs install from the selected path", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-github-tree-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(join(source, "skills", "tree-skill"), "tree-skill", "From a GitHub tree URL");
  git(["init"], source);
  git(["branch", "-M", "main"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  writeFileSync(join(root, ".gitconfig"), `[url "${pathToFileURL(source).href}"]\n\tinsteadOf = https://github.com/skillport-fixtures/tree-url.git\n`);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", "https://github.com/skillport-fixtures/tree-url/tree/main/skills/tree-skill"], {
    cwd: project,
    hub,
    home: root
  });
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(cli(["info", "tree-skill"], { cwd: project, hub, home: root }).stdout);
  assert.equal(info.skill.sourceRef, "main");
  assert.equal(info.skill.sourceLocation, "https://github.com/skillport-fixtures/tree-url/tree/main/skills/tree-skill");
});

test("Git install scans a repository directory that contains multiple Skills", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-multi-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(join(source, "skills", "alpha"), "git-alpha", "First Git Skill");
  makeSkill(join(source, "skills", "beta"), "git-beta", "Second Git Skill");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", pathToFileURL(source).href, "--path", "skills"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const list = cli(["list"], { cwd: project, hub, home: root }).stdout;
  assert.match(list, /git-alpha\s+First Git Skill/);
  assert.match(list, /git-beta\s+Second Git Skill/);
});

test("Git install rejects duplicate names before partial multi-Skill installs", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-duplicate-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(join(source, "skills", "first"), "same-git-skill", "First");
  makeSkill(join(source, "skills", "second"), "same-git-skill", "Second");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  cli(["init"], { cwd: project, hub, home: root });

  const preview = cli(["install", pathToFileURL(source).href, "--path", "skills", "--dry-run", "--json"], { cwd: project, hub, home: root });
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).failed.map((item) => item.reason), ["Duplicate Skill name in install set: same-git-skill"]);

  const result = cli(["install", pathToFileURL(source).href, "--path", "skills"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate Skill name in install set: same-git-skill/);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});

test("Git dry-run lists invalid Skills without installing valid siblings", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-git-invalid-preview-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "repo");
  mkdirSync(project);
  mkdirSync(source);
  makeSkill(join(source, "skills", "valid"), "valid-git-skill", "Valid Git Skill");
  mkdirSync(join(source, "skills", "invalid"), { recursive: true });
  writeFileSync(join(source, "skills", "invalid", "SKILL.md"), "---\nname: InvalidGitSkill\ndescription: Invalid Git Skill\n---\n");
  git(["init"], source);
  git(["add", "."], source);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], source);
  cli(["init"], { cwd: project, hub, home: root });

  const preview = cli(["install", pathToFileURL(source).href, "--path", "skills", "--dry-run", "--json"], { cwd: project, hub, home: root });
  assert.equal(preview.status, 0, preview.stderr);
  const value = JSON.parse(preview.stdout);
  assert.deepEqual(value.skills.map((skill) => skill.name), ["valid-git-skill"]);
  assert.match(value.failed[0].reason, /Suggested name: invalidgitskill/);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});

test("Git installs disable interactive credential prompts", { skip: process.platform === "win32" }, () => {
  const fixture = gitFixture("prompt");
  const fakePath = fakeGit(fixture.root, "process.stderr.write(`prompt=${process.env.GIT_TERMINAL_PROMPT}\\n`); process.exit(1);");

  const result = cli(["install", "https://example.invalid/skill.git"], {
    ...fixture.options,
    env: { PATH: fakePath }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prompt=0/);
});

test("Git installs honor the configured command timeout", { skip: process.platform === "win32" }, () => {
  const fixture = gitFixture("timeout");
  const fakePath = fakeGit(fixture.root, "setTimeout(() => { process.stderr.write('late\\n'); process.exit(1); }, 500);");
  const started = Date.now();
  const result = cli(["install", "https://example.invalid/skill.git"], {
    ...fixture.options,
    env: { PATH: fakePath, SKLP_GIT_TIMEOUT_MS: "50" }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Git source timed out after 50ms/);
  assert.ok(Date.now() - started < 350);
});

function gitFixture(name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-git-${name}-`));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  return { root, options };
}

function fakeGit(root, body) {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const executable = join(bin, "git");
  writeFileSync(executable, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(executable, 0o755);
  return `${bin}:${process.env.PATH}`;
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
