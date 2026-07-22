import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DesktopSkillPort, toDesktopError } from "../dist/desktop.js";
import { makeSkill } from "./helpers.js";

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

test("desktop errors are stable and sanitized", () => {
  const error = toDesktopError(new Error("failed with https://user:secret@example.com/private.git"));
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(error.message, /secret/);
});
