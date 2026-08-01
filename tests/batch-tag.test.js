import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("batch tag add previews and atomically preserves existing tags", (t) => {
  const fixture = setup(t, "add");
  assert.equal(cli(["tag", "add", "Publisher", "alpha-skill"], fixture.options).status, 0);

  const preview = cli([
    "tag", "add", "develop", "alpha-skill", "beta-skill", "ALPHA-SKILL", "--dry-run", "--json"
  ], fixture.options);
  assert.equal(preview.status, 0, preview.stderr);
  const previewValue = JSON.parse(preview.stdout);
  assert.equal(previewValue.dryRun, true);
  assert.equal(previewValue.tag, "develop");
  assert.deepEqual(previewValue.skills.map(({ name, tags }) => ({ name, tags })), [
    { name: "alpha-skill", tags: ["develop", "Publisher"] },
    { name: "beta-skill", tags: ["develop"] }
  ]);
  assert.deepEqual(installedTags(fixture, "alpha-skill"), ["Publisher"]);
  assert.deepEqual(installedTags(fixture, "beta-skill"), []);

  const added = cli(["tag", "add", "develop", "alpha-skill", "beta-skill", "--json"], fixture.options);
  assert.equal(added.status, 0, added.stderr);
  assert.deepEqual(JSON.parse(added.stdout).skills.map(({ name, tags }) => ({ name, tags })), [
    { name: "alpha-skill", tags: ["develop", "Publisher"] },
    { name: "beta-skill", tags: ["develop"] }
  ]);
  assert.deepEqual(
    JSON.parse(cli(["list", "--tag", "DEVELOP", "--json"], fixture.options).stdout).skills.map((skill) => skill.name),
    ["alpha-skill", "beta-skill"]
  );
  assert.equal(cli(["tag", "add", "DEVELOP", "alpha-skill", "beta-skill"], fixture.options).status, 0);
  assert.deepEqual(installedTags(fixture, "alpha-skill"), ["develop", "Publisher"]);

  const failed = cli(["tag", "add", "backend", "alpha-skill", "missing-skill", "--json"], fixture.options);
  assert.equal(failed.status, 1);
  assert.equal(JSON.parse(failed.stdout).error.code, "COMMAND_FAILED");
  assert.deepEqual(installedTags(fixture, "alpha-skill"), ["develop", "Publisher"]);
});

test("batch tag add validates the merged tag limit before changing any Skill", (t) => {
  const fixture = setup(t, "limit");
  for (let index = 0; index < 32; index += 1) {
    assert.equal(cli(["tag", "add", `tag-${index}`, "alpha-skill"], fixture.options).status, 0);
  }

  const failed = cli(["tag", "add", "overflow", "beta-skill", "alpha-skill", "--json"], fixture.options);
  assert.equal(failed.status, 1);
  assert.match(JSON.parse(failed.stdout).error.message, /at most 32 tags/);
  assert.deepEqual(installedTags(fixture, "beta-skill"), []);
  assert.equal(installedTags(fixture, "alpha-skill").length, 32);
});

function setup(t, name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-batch-tag-${name}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  for (const skill of ["alpha-skill", "beta-skill"]) {
    const source = join(root, skill);
    makeSkill(source, skill, `${skill} description`);
    assert.equal(cli(["install", source], options).status, 0);
  }
  return { options };
}

function installedTags(fixture, name) {
  return JSON.parse(cli(["info", name], fixture.options).stdout).skill.tags;
}
