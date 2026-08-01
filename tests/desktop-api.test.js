import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DesktopSkillPort, toDesktopError } from "../dist/desktop.js";
import { cli, makeSkill } from "./helpers.js";

function withEnvironment(root, fn) {
  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SKLP_HOME: process.env.SKLP_HOME,
    SKLP_TEST_HOME: process.env.SKLP_TEST_HOME
  };
  const hub = join(root, "hub");
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  process.env.SKLP_HOME = hub;
  process.env.SKLP_TEST_HOME = root;
  try {
    return fn({ hub });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("desktop facade initializes a Hub and exposes project and Skill DTOs", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-api-"));
  const project = join(root, "project");
  const second = join(root, "second");
  const source = join(root, "source");
  const conflictingHub = join(root, "conflicting-hub");
  mkdirSync(project);
  mkdirSync(second);
  makeSkill(source, "desktop-skill", "Desktop Skill");

  withEnvironment(root, ({ hub }) => {
    const desktop = new DesktopSkillPort();
    assert.equal(desktop.getBootstrapState().initialized, false);
    assert.throws(
      () => desktop.initialize({ project, hub: conflictingHub }),
      /SKLP_HOME/
    );
    assert.equal(existsSync(conflictingHub), false);
    const initialized = desktop.initialize({ project });
    assert.equal(initialized.initialized, true);
    assert.equal(initialized.projectCount, 1);
    assert.deepEqual(desktop.doctor(), []);
    assert.equal(existsSync(join(root, ".agents", "skills", "skill-port")), false);
    assert.equal(desktop.registerProject(second), realpathSync(second));
    assert.deepEqual(desktop.listProjects().sort(), [realpathSync(project), realpathSync(second)].sort());

    assert.deepEqual(desktop.previewInstall(source).skills, [{ name: "desktop-skill", description: "Desktop Skill" }]);
    const [installed] = desktop.install(source);
    assert.equal(installed.installationKind, "local-copy");
    assert.equal(installed.health, "not-enabled");
    assert.equal(installed.enablementCount, 0);

    const skillContents = readFileSync(join(hub, "skills", "desktop-skill", "SKILL.md"), "utf8");
    const tagged = desktop.updateTags("desktop-skill", ["  Video ", "productivity", "video"]);
    assert.deepEqual(tagged.tags, ["productivity", "Video"]);
    assert.deepEqual(desktop.listSkills("VIDEO").map((skill) => skill.name), ["desktop-skill"]);
    assert.equal(readFileSync(join(hub, "skills", "desktop-skill", "SKILL.md"), "utf8"), skillContents);
    const catalog = JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8"));
    assert.equal("tags" in catalog.skills[0], false);

    const cleared = desktop.updateTags("desktop-skill", []);
    assert.deepEqual(cleared.tags, []);

    desktop.enable("desktop-skill", { type: "project", path: project });
    const enabled = desktop.getSkill("desktop-skill");
    assert.equal(enabled.health, "healthy");
    assert.equal(enabled.enablementCount, 1);
    desktop.disable("desktop-skill", { type: "project", path: project });
    desktop.remove("desktop-skill");
    assert.deepEqual(desktop.listSkills(), []);
  });
});

test("desktop facade reads tags added by the CLI from the same Hub", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-cli-tags-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const source = join(root, "source");
  const hub = join(root, "hub");
  mkdirSync(project);
  makeSkill(source, "cli-tagged-skill", "Tagged through CLI");
  const options = { cwd: project, hub, home: root };

  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", source], options).status, 0);
  const tagged = cli(["tag", "add", "develop", "cli-tagged-skill"], options);
  assert.equal(tagged.status, 0, tagged.stderr);

  withEnvironment(root, () => {
    const desktop = new DesktopSkillPort();
    assert.deepEqual(desktop.getSkill("cli-tagged-skill").tags, ["develop"]);
    assert.deepEqual(desktop.listSkills("DEVELOP").map((skill) => skill.name), ["cli-tagged-skill"]);
  });

});

test("desktop facade previews links and preserves linked source on unlink", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-link-"));
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "linked-skill", "Linked Skill");

  withEnvironment(root, () => {
    const desktop = new DesktopSkillPort();
    desktop.initialize({ project });
    assert.deepEqual(desktop.previewLink(source), { name: "linked-skill", description: "Linked Skill" });
    assert.equal(desktop.link(source).installationKind, "linked");
    desktop.unlink("linked-skill");
    assert.equal(existsSync(join(source, "SKILL.md")), true);
  });
});

test("desktop facade checks, previews, and updates copied Git Skills without changing enablements", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-update-"));
  const project = join(root, "project");
  const repo = join(root, "repo");
  mkdirSync(project);
  makeSkill(repo, "desktop-git-skill", "Before update");
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], repo);

  withEnvironment(root, () => {
    const desktop = new DesktopSkillPort();
    desktop.initialize({ project });
    desktop.install(pathToFileURL(repo).href);
    desktop.enable("desktop-git-skill", { type: "project", path: project });

    makeSkill(repo, "desktop-git-skill", "After update");
    git(["add", "."], repo);
    git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], repo);
    const revision = git(["rev-parse", "HEAD"], repo);

    const check = desktop.checkUpdate("desktop-git-skill");
    assert.equal(check.status, "outdated");
    assert.equal(check.remoteRevision, revision);
    assert.deepEqual(desktop.previewUpdate("desktop-git-skill").planned, [{ name: "desktop-git-skill", revision }]);
    assert.equal(desktop.previewAllUpdates().planned[0].name, "desktop-git-skill");

    const updated = desktop.update("desktop-git-skill");
    assert.equal(updated.description, "After update");
    assert.equal(updated.sourceRevision, revision);
    assert.equal(updated.enablementCount, 1);
    assert.equal(desktop.checkUpdate("desktop-git-skill").status, "up-to-date");
  });
});

test("desktop facade previews and moves pinned Git Skills to an explicit branch", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-retrack-"));
  const project = join(root, "project");
  const repo = join(root, "repo");
  mkdirSync(project);
  makeSkill(join(repo, "skills", "alpha"), "desktop-alpha-pinned", "Before alpha");
  makeSkill(join(repo, "skills", "bravo"), "desktop-bravo-pinned", "Before bravo");
  git(["init"], repo);
  git(["branch", "-M", "main"], repo);
  git(["add", "."], repo);
  git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], repo);
  const pinnedRevision = git(["rev-parse", "HEAD"], repo);

  withEnvironment(root, () => {
    const desktop = new DesktopSkillPort();
    desktop.initialize({ project });
    desktop.install(pathToFileURL(repo).href, { ref: pinnedRevision });
    assert.deepEqual(desktop.checkAllUpdates().map((item) => item.status), ["pinned", "pinned"]);

    makeSkill(join(repo, "skills", "alpha"), "desktop-alpha-pinned", "After alpha");
    makeSkill(join(repo, "skills", "bravo"), "desktop-bravo-pinned", "After bravo");
    git(["add", "."], repo);
    git(["-c", "user.name=Skill Port Test", "-c", "user.email=test@example.com", "commit", "-m", "update"], repo);
    const branchRevision = git(["rev-parse", "HEAD"], repo);

    assert.deepEqual(desktop.previewUpdate("desktop-alpha-pinned", "main").planned, [
      { name: "desktop-alpha-pinned", revision: branchRevision }
    ]);
    const alpha = desktop.update("desktop-alpha-pinned", "main");
    assert.equal(alpha.sourceRef, "main");
    assert.equal(alpha.sourceTracking, "branch");
    assert.equal(alpha.sourceRevision, branchRevision);

    assert.deepEqual(desktop.previewAllUpdates("main").planned.map((item) => item.name), [
      "desktop-alpha-pinned",
      "desktop-bravo-pinned"
    ]);
    const result = desktop.updateAll("main");
    assert.deepEqual(result.updated.map((item) => item.name), ["desktop-alpha-pinned", "desktop-bravo-pinned"]);
    const bravo = desktop.getSkill("desktop-bravo-pinned");
    assert.equal(bravo.sourceRef, "main");
    assert.equal(bravo.sourceTracking, "branch");
    assert.equal(bravo.sourceRevision, branchRevision);
  });
});

test("desktop facade preserves unmanaged enablement conflicts", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-conflict-"));
  const project = join(root, "project");
  const source = join(root, "source");
  const unmanaged = join(root, "unmanaged");
  mkdirSync(project);
  makeSkill(source, "conflict-skill", "Conflict Skill");
  mkdirSync(unmanaged);

  withEnvironment(root, () => {
    const desktop = new DesktopSkillPort();
    desktop.initialize({ project });
    desktop.install(source);
    desktop.enable("conflict-skill", { type: "project", path: project });
    const entry = join(project, ".agents", "skills", "conflict-skill");
    rmSync(entry);
    symlinkSync(unmanaged, entry, "dir");
    assert.throws(() => desktop.remove("conflict-skill", true), /unmanaged/);
    assert.equal(desktop.getSkill("conflict-skill").health, "conflict");
  });
});

test("desktop facade reports the same content and source drift as CLI status", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-status-"));
  const project = join(root, "project");
  const missingSource = join(root, "missing-source");
  const conflictSource = join(root, "conflict-source");
  const linkedSource = join(root, "linked-source");
  mkdirSync(project);
  makeSkill(missingSource, "missing-skill", "Missing Skill");
  makeSkill(conflictSource, "conflict-skill", "Conflict Skill");
  makeSkill(linkedSource, "linked-skill", "Linked Skill");

  try {
    withEnvironment(root, ({ hub }) => {
      const desktop = new DesktopSkillPort();
      desktop.initialize({ project });
      desktop.install(missingSource);
      desktop.install(conflictSource);
      desktop.link(linkedSource);

      rmSync(join(hub, "skills", "missing-skill", "SKILL.md"));
      writeFileSync(join(hub, "skills", "conflict-skill", "meta.json"), "{}\n");
      rmSync(linkedSource, { recursive: true });

      assert.deepEqual(
        desktop.listSkills().map(({ name, health }) => ({ name, health })),
        [
          { name: "conflict-skill", health: "conflict" },
          { name: "linked-skill", health: "missing" },
          { name: "missing-skill", health: "missing" }
        ]
      );
      assert.equal(desktop.getSkill("conflict-skill").health, "conflict");
      assert.equal(desktop.getSkill("linked-skill").health, "missing");
      assert.equal(desktop.getSkill("missing-skill").health, "missing");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop facade exports a localized static catalog without mutating Hub state", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-desktop-export-"));
  const project = join(root, "project");
  const source = join(root, "source");
  const output = join(root, "catalog.html");
  mkdirSync(project);
  makeSkill(source, "exported-skill", "Exported Skill");

  try {
    withEnvironment(root, () => {
      const desktop = new DesktopSkillPort();
      desktop.initialize({ project });
      desktop.install(source);

      const result = desktop.exportCatalog(output, { language: "zh-CN" });
      assert.deepEqual(result, { output, skillCount: 1 });
      const html = readFileSync(output, "utf8");
      assert.match(html, /<html lang="zh-CN">/);
      assert.match(html, /exported-skill/);
      assert.match(html, /Exported Skill/);
      assert.throws(() => desktop.exportCatalog(output), /already exists/);
      assert.deepEqual(desktop.exportCatalog(output, { force: true }), { output, skillCount: 1 });
      assert.equal(desktop.listSkills().length, 1);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop errors are stable and sanitized", () => {
  const error = toDesktopError(new Error("failed with https://user:secret@example.com/private.git"));
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(error.message, /secret/);
});
