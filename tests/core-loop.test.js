import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { cli, makeSkill } from "./helpers.js";

test("core project lifecycle and catalogs", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-core-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);

  assert.equal(cli(["init"], { cwd: project, hub, home: root }).status, 0);
  const installed = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(cli(["list"], { cwd: project, hub, home: root }).stdout, /sample-skill\s+A sample skill/);

  const catalog = JSON.parse(readFileSync(join(hub, "catalog.json"), "utf8"));
  assert.deepEqual(Object.keys(catalog.skills[0]).sort(), ["description", "instanceId", "name"]);
  assert.equal(catalog.skills[0].name, "sample-skill");

  const enabled = cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(existsSync(join(project, ".agents", "skills", "sample-skill", "SKILL.md")), true);

  assert.equal(cli(["doctor"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["remove", "sample-skill"], { cwd: project, hub, home: root }).status, 1);
  assert.equal(cli(["disable", "sample-skill"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["remove", "sample-skill"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(existsSync(join(hub, "skills", "sample-skill")), false);
});

test("global enablement changes only the selected tool", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-global-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });

  const result = cli(["enable", "sample-skill", "--global", "codex"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(cli(["enable", "sample-skill", "--global", "codex"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["enable", "sample-skill", "--global", "claude"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(existsSync(join(root, ".codex", "skills", "sample-skill", "SKILL.md")), true);
  assert.equal(existsSync(join(root, ".claude", "skills", "sample-skill", "SKILL.md")), true);
  const info = JSON.parse(cli(["info", "sample-skill"], { cwd: project, hub, home: root }).stdout);
  assert.equal(info.enablements.length, 2);
  assert.equal(info.enablements.every((item) => item.linkType === "symlink"), true);
  assert.equal(info.enablements.every((item) => item.health === "healthy"), true);
  rmSync(join(root, ".claude", "skills", "sample-skill"));
  const driftedInfo = JSON.parse(cli(["info", "sample-skill"], { cwd: project, hub, home: root }).stdout);
  assert.equal(driftedInfo.enablements.find((item) => item.targetKey === "claude").health, "missing");
  assert.equal(cli(["disable", "sample-skill", "--global", "codex"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["disable", "sample-skill", "--global", "codex"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["disable", "sample-skill", "--global", "claude"], { cwd: project, hub, home: root }).status, 0);
});

test("doctor reports a removed managed link without repairing it", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-doctor-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  const entry = join(project, ".agents", "skills", "sample-skill");
  rmSync(entry);

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENABLEMENT_DRIFT/);
  assert.equal(existsSync(entry), false);
  assert.equal(cli(["disable", "sample-skill"], { cwd: project, hub, home: root }).status, 0);
  assert.equal(cli(["doctor"], { cwd: project, hub, home: root }).status, 0);
});

test("doctor reports metadata and catalog drift without rewriting either", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-drift-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  const meta = join(hub, "skills", "sample-skill", "meta.json");
  const catalog = join(hub, "catalog.json");
  const catalogMarkdown = join(hub, "catalog.md");
  writeFileSync(meta, "{}\n");
  writeFileSync(catalog, "{}\n");
  writeFileSync(catalogMarkdown, "# stale\n");

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /META_DRIFT/);
  assert.match(result.stderr, /CATALOG_DRIFT/);
  assert.match(result.stderr, /CATALOG_MARKDOWN_DRIFT/);
  assert.equal(readFileSync(meta, "utf8"), "{}\n");
  assert.equal(readFileSync(catalog, "utf8"), "{}\n");
  assert.equal(readFileSync(catalogMarkdown, "utf8"), "# stale\n");
});

test("doctor opens SQLite read-only", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-doctor-readonly-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  const database = join(hub, "state.db");
  const before = createHash("sha256").update(readFileSync(database)).digest("hex");

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  const after = createHash("sha256").update(readFileSync(database)).digest("hex");
  assert.equal(after, before);
});

test("doctor distinguishes invalid Skill metadata and invalid catalog JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-invalid-diagnostics-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  const skillDocument = join(hub, "skills", "sample-skill", "SKILL.md");
  const catalog = join(hub, "catalog.json");
  writeFileSync(skillDocument, "invalid");
  writeFileSync(catalog, "{invalid");

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SKILL_METADATA_INVALID/);
  assert.match(result.stderr, /CATALOG_INVALID/);
  assert.equal(readFileSync(skillDocument, "utf8"), "invalid");
  assert.equal(readFileSync(catalog, "utf8"), "{invalid");
});

test("the nearest registered project wins from a nested directory", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-projects-"));
  const hub = join(root, "hub");
  const outer = join(root, "outer");
  const inner = join(outer, "packages", "inner");
  const nested = join(inner, "src");
  const source = join(root, "source");
  mkdirSync(nested, { recursive: true });
  makeSkill(source);
  cli(["init"], { cwd: outer, hub, home: root });
  cli(["init"], { cwd: inner, hub, home: root });
  cli(["install", source], { cwd: inner, hub, home: root });

  const result = cli(["enable", "sample-skill"], { cwd: nested, hub, home: root });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(inner, ".agents", "skills", "sample-skill")), true);
  assert.equal(existsSync(join(outer, ".agents", "skills", "sample-skill")), false);
});

test("doctor reports an interrupted mutation journal entry", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-operation-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  const db = new DatabaseSync(join(hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,created_at) VALUES(?,?,?,?)")
    .run("interrupted-test", "install", "started", new Date().toISOString());
  db.close();

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /OPERATION_INTERRUPTED/);
});

test("doctor reports an invalid recorded link type", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-link-type-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  const db = new DatabaseSync(join(hub, "state.db"));
  db.exec("UPDATE enablements SET link_type='bogus'");
  db.close();

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LINK_TYPE_DRIFT/);
});

test("doctor reports target record path drift", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-target-record-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  const db = new DatabaseSync(join(hub, "state.db"));
  db.exec("UPDATE enablements SET target_path=target_path || '-wrong'");
  db.close();

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TARGET_RECORD_DRIFT/);
});

test("explicit project targeting requires registration and cannot combine with global", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-explicit-project-"));
  const hub = join(root, "hub");
  const first = join(root, "first");
  const second = join(root, "second");
  const unregistered = join(root, "unregistered");
  const source = join(root, "source");
  mkdirSync(first);
  mkdirSync(second);
  mkdirSync(unregistered);
  makeSkill(source);
  cli(["init"], { cwd: first, hub, home: root });
  cli(["init", "--project", second], { cwd: first, hub, home: root });
  cli(["install", source], { cwd: first, hub, home: root });

  const enabled = cli(["enable", "sample-skill", "--project", second], { cwd: first, hub, home: root });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(existsSync(join(second, ".agents", "skills", "sample-skill")), true);
  assert.equal(cli(["enable", "sample-skill", "--project", unregistered], { cwd: first, hub, home: root }).status, 1);
  assert.equal(cli(["enable", "sample-skill", "--project", second, "--global", "codex"], {
    cwd: first,
    hub,
    home: root
  }).status, 1);
});

test("global target validation fails before creating entries", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-global-errors-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });

  assert.equal(cli(["enable", "sample-skill", "--global"], { cwd: project, hub, home: root }).status, 1);
  assert.equal(cli(["enable", "sample-skill", "--global", "codex,claude"], { cwd: project, hub, home: root }).status, 1);
  assert.equal(existsSync(join(root, ".codex", "skills", "sample-skill")), false);
  assert.equal(existsSync(join(root, ".claude", "skills", "sample-skill")), false);
});

test("doctor reports a Hub link with no enablement record", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-orphan-entry-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  cli(["init"], { cwd: project, hub, home: root });
  cli(["install", source], { cwd: project, hub, home: root });
  cli(["enable", "sample-skill"], { cwd: project, hub, home: root });
  const db = new DatabaseSync(join(hub, "state.db"));
  db.exec("DELETE FROM enablements");
  db.close();

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /UNREGISTERED_ENTRY/);
});

test("doctor reports a stable diagnostic for an unreadable database", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-corrupt-db-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  writeFileSync(join(hub, "state.db"), "not a sqlite database");

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_UNREADABLE/);
  assert.equal(readFileSync(join(hub, "state.db"), "utf8"), "not a sqlite database");
});

test("doctor reports a missing Hub skills directory without crashing", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-missing-skills-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  rmSync(join(hub, "skills"), { recursive: true });

  const result = cli(["doctor"], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HUB_SKILLS_UNAVAILABLE/);
  assert.equal(existsSync(join(hub, "skills")), false);
});
