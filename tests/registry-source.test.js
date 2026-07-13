import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { cli, makeSkill } from "./helpers.js";

test("install expands registry local paths into concrete Skill directories", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  const warehouse = join(repo, "warehouse");
  mkdirSync(project);
  mkdirSync(registry, { recursive: true });
  makeSkill(join(warehouse, "single"), "single-skill", "Root Skill wins");
  makeSkill(join(warehouse, "single", "nested"), "ignored-child", "Should not be scanned");
  makeSkill(join(warehouse, "collection", "alpha"), "alpha-skill", "First nested Skill");
  makeSkill(join(warehouse, "collection", "deep", "beta"), "beta-skill", "Second nested Skill");
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    single: { type: "local", local_path: "warehouse/single" },
    collection: { type: "local", local_path: "warehouse/collection" }
  }, null, 2)}\n`);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", join(registry, "sources.json")], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed single-skill/);
  assert.match(result.stdout, /Installed alpha-skill/);
  assert.match(result.stdout, /Installed beta-skill/);
  assert.doesNotMatch(result.stdout, /ignored-child/);

  const list = cli(["list"], { cwd: project, hub, home: root }).stdout;
  assert.match(list, /single-skill\s+Root Skill wins/);
  assert.match(list, /alpha-skill\s+First nested Skill/);
  assert.match(list, /beta-skill\s+Second nested Skill/);
  assert.doesNotMatch(list, /ignored-child/);
  assert.equal(existsSync(join(hub, "skills", "single-skill", "meta.json")), true);
  const catalog = JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8"));
  assert.deepEqual(catalog.skills.map((skill) => skill.name).sort(), ["alpha-skill", "beta-skill", "single-skill"]);
});

test("registry install fails when a local path contains no Skill", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-empty-registry-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  mkdirSync(project);
  mkdirSync(join(repo, "warehouse", "empty"), { recursive: true });
  mkdirSync(registry, { recursive: true });
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    empty: { type: "local", local_path: "warehouse/empty" }
  }, null, 2)}\n`);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", join(registry, "sources.json")], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No Skill found for registry source: empty/);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});

test("registry dry-run previews Skills without installing them", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-dry-run-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  mkdirSync(project);
  mkdirSync(registry, { recursive: true });
  makeSkill(join(repo, "warehouse", "collection", "alpha"), "alpha-skill", "First nested Skill");
  makeSkill(join(repo, "warehouse", "collection", "beta"), "beta-skill", "Second nested Skill");
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    collection: { type: "local", local_path: "warehouse/collection" }
  }, null, 2)}\n`);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", join(registry, "sources.json"), "--dry-run", "--json"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.dryRun, true);
  assert.deepEqual(value.skills.map((skill) => skill.name), ["alpha-skill", "beta-skill"]);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});

test("registry install preflight rejects duplicate names without partial installs", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-duplicate-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  mkdirSync(project);
  mkdirSync(registry, { recursive: true });
  makeSkill(join(repo, "warehouse", "first"), "same-skill", "First");
  makeSkill(join(repo, "warehouse", "second"), "same-skill", "Second");
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    first: { type: "local", local_path: "warehouse/first" },
    second: { type: "local", local_path: "warehouse/second" }
  }, null, 2)}\n`);
  cli(["init"], { cwd: project, hub, home: root });

  const result = cli(["install", join(registry, "sources.json")], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate Skill name in install set: same-skill/);
  assert.match(result.stderr, /请修改/);
  assert.equal(cli(["list"], { cwd: project, hub, home: root }).stdout, "");
});

test("registry install preflight rejects already installed names without partial installs", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-existing-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  mkdirSync(project);
  mkdirSync(registry, { recursive: true });
  makeSkill(join(repo, "warehouse", "existing"), "existing-skill", "Already here");
  makeSkill(join(repo, "warehouse", "new"), "new-skill", "Should not install");
  cli(["init"], { cwd: project, hub, home: root });
  assert.equal(cli(["install", join(repo, "warehouse", "existing")], { cwd: project, hub, home: root }).status, 0);
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    existing: { type: "local", local_path: "warehouse/existing" },
    next: { type: "local", local_path: "warehouse/new" }
  }, null, 2)}\n`);

  const result = cli(["install", join(registry, "sources.json")], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Skill already installed: existing-skill/);
  const list = cli(["list"], { cwd: project, hub, home: root }).stdout;
  assert.match(list, /existing-skill\s+Already here/);
  assert.doesNotMatch(list, /new-skill/);
});

test("registry install can skip already installed Skills", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-skip-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const repo = join(root, "repo");
  const registry = join(repo, "registry");
  mkdirSync(project);
  mkdirSync(registry, { recursive: true });
  makeSkill(join(repo, "warehouse", "existing"), "existing-skill", "Already here");
  makeSkill(join(repo, "warehouse", "new"), "new-skill", "Fresh import");
  cli(["init"], { cwd: project, hub, home: root });
  assert.equal(cli(["install", join(repo, "warehouse", "existing")], { cwd: project, hub, home: root }).status, 0);
  writeFileSync(join(registry, "sources.json"), `${JSON.stringify({
    existing: { type: "local", local_path: "warehouse/existing" },
    next: { type: "local", local_path: "warehouse/new" }
  }, null, 2)}\n`);

  const preview = cli(["install", join(registry, "sources.json"), "--skip-existing", "--dry-run", "--json"], {
    cwd: project,
    hub,
    home: root
  });
  assert.equal(preview.status, 0, preview.stderr);
  const previewValue = JSON.parse(preview.stdout);
  assert.deepEqual(previewValue.skills.map((skill) => skill.name), ["new-skill"]);
  assert.deepEqual(previewValue.skipped, [{ name: "existing-skill", description: "Already here", reason: "already-installed" }]);

  const result = cli(["install", join(registry, "sources.json"), "--skip-existing"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipped existing existing-skill/);
  assert.match(result.stdout, /Installed new-skill/);
  const list = cli(["list"], { cwd: project, hub, home: root }).stdout;
  assert.match(list, /existing-skill\s+Already here/);
  assert.match(list, /new-skill\s+Fresh import/);
});

test("dry-run does not recover interrupted operations", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-registry-dry-run-state-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const installed = join(root, "installed");
  const preview = join(root, "preview");
  mkdirSync(project);
  makeSkill(installed, "installed-skill", "Already installed");
  makeSkill(preview, "preview-skill", "Preview only");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", installed], options).status, 0);
  const db = new DatabaseSync(join(hub, "state.db"));
  db.exec("UPDATE operations SET status='started', finished_at=NULL WHERE kind='install'");
  db.close();

  const result = cli(["install", preview, "--dry-run"], options);
  assert.equal(result.status, 0, result.stderr);
  const after = new DatabaseSync(join(hub, "state.db"));
  const operation = after.prepare("SELECT status FROM operations WHERE kind='install'").get();
  after.close();
  assert.equal(operation.status, "started");
});
