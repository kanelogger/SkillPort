import assert from "node:assert/strict";
import {
  existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("prune previews and removes only unused copied Skills", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-prune-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const unusedSource = join(root, "unused-source");
  const enabledSource = join(root, "enabled-source");
  const linkedSource = join(root, "linked-source");
  mkdirSync(project);
  makeSkill(unusedSource, "unused-copy", "Unused copied Skill");
  makeSkill(enabledSource, "enabled-copy", "Enabled copied Skill");
  makeSkill(linkedSource, "linked-skill", "Linked Skill");

  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", unusedSource], options).status, 0);
  assert.equal(cli(["install", enabledSource], options).status, 0);
  assert.equal(cli(["link", linkedSource], options).status, 0);
  assert.equal(cli(["enable", "enabled-copy"], options).status, 0);

  const hubBefore = snapshotTree(hub);
  const managedBefore = snapshotTree(join(project, ".agents"));
  const preview = cli(["prune", "--dry-run", "--json"], options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stderr, "");
  assert.deepEqual(JSON.parse(preview.stdout), {
    dryRun: true,
    planned: [{ name: "unused-copy" }],
    skipped: [{ name: "linked-skill", reason: "linked" }]
  });
  assert.deepEqual(snapshotTree(hub), hubBefore);
  assert.deepEqual(snapshotTree(join(project, ".agents")), managedBefore);
  assert.equal(existsSync(join(hub, "skills", "unused-copy")), true);
  assert.equal(existsSync(join(hub, "skills", "linked-skill")), true);

  const unconfirmed = cli(["prune", "--json"], options);
  assert.equal(unconfirmed.status, 1);
  assert.equal(unconfirmed.stderr, "");
  assert.deepEqual(JSON.parse(unconfirmed.stdout), {
    error: {
      code: "COMMAND_FAILED",
      message: "Pass --yes to remove unused copied Skills, or use --dry-run to preview."
    }
  });
  assert.equal(existsSync(join(hub, "skills", "unused-copy")), true);

  const result = cli(["prune", "--yes", "--json"], options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    removed: [{ name: "unused-copy" }],
    skipped: [{ name: "linked-skill", reason: "linked" }],
    failed: []
  });
  assert.equal(existsSync(join(hub, "skills", "unused-copy")), false);
  assert.equal(existsSync(join(hub, "skills", "enabled-copy")), true);
  assert.equal(existsSync(join(hub, "skills", "linked-skill")), true);
  assert.equal(existsSync(join(linkedSource, "SKILL.md")), true);
  assert.deepEqual(
    JSON.parse(cli(["list", "--json"], options).stdout).skills.map((skill) => skill.name),
    ["enabled-copy", "linked-skill"]
  );
});

test("prune continues after individual removal failures and reports them", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-prune-failure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const alphaSource = join(root, "alpha-source");
  const bravoSource = join(root, "bravo-source");
  mkdirSync(project);
  makeSkill(alphaSource, "alpha-copy", "Alpha copy");
  makeSkill(bravoSource, "bravo-copy", "Bravo copy");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", alphaSource], options).status, 0);
  assert.equal(cli(["install", bravoSource], options).status, 0);
  rmSync(join(hub, "catalog.md"));
  mkdirSync(join(hub, "catalog.md"));

  const result = cli(["prune", "--yes", "--json"], options);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.removed, []);
  assert.deepEqual(payload.skipped, []);
  assert.deepEqual(payload.failed.map((item) => item.name), ["alpha-copy", "bravo-copy"]);
  assert.deepEqual(
    JSON.parse(cli(["list", "--json"], options).stdout).skills.map((skill) => skill.name),
    ["alpha-copy", "bravo-copy"]
  );
  assert.equal(existsSync(join(hub, "skills", "alpha-copy")), true);
  assert.equal(existsSync(join(hub, "skills", "bravo-copy")), true);
});

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
