import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
