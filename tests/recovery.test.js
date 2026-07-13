import assert from "node:assert/strict";
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { StateStore } from "../dist/infrastructure/database.js";
import { resolveHub } from "../dist/infrastructure/config.js";
import { cli, makeSkill } from "./helpers.js";

test("an interrupted install is rolled back before the next mutation", () => {
  const fixture = setup("install");
  cli(["install", fixture.source], fixture.options);
  const before = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout).skill.instanceId;
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.exec("UPDATE operations SET status='started', finished_at=NULL WHERE kind='install'");
  db.close();

  assert.equal(cli(["list"], fixture.options).stdout, "");
  const result = cli(["install", fixture.source], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout).skill.instanceId;
  assert.notEqual(after, before);
});

test("an interrupted update restores its backup before enabling", () => {
  const fixture = setup("update");
  cli(["install", fixture.source], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const destination = join(fixture.hub, "skills", "sample-skill");
  const backup = join(fixture.hub, ".staging", "recovery-update-backup");
  const payload = { kind: "update", skill: info.skill, destination, backup };
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("crashed-update", "update", "started", JSON.stringify(payload), new Date().toISOString());
  db.close();
  renameSync(destination, backup);

  const result = cli(["enable", "sample-skill"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(destination, "SKILL.md")), true);
  assert.equal(existsSync(backup), false);
});

test("an interrupted linked update republishes catalogs from committed state", () => {
  const fixture = setup("linked-update");
  assert.equal(cli(["link", fixture.source], fixture.options).status, 0);
  const before = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout).skill;
  makeSkill(fixture.source, "sample-skill", "Updated linked description");
  assert.equal(cli(["update", "sample-skill"], fixture.options).status, 0);
  const current = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout).skill;
  writeFileSync(join(fixture.hub, "catalog.json"), "{\"skills\":[]}\n");
  writeFileSync(join(fixture.hub, "catalog.md"), "# Skill Port Catalog\n\n");
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("crashed-linked-update", "update", "started", JSON.stringify({
      kind: "update", skill: before, destination: join(fixture.hub, "skills", "sample-skill"), linked: true
    }), new Date().toISOString());
  db.close();

  assert.equal(cli(["list"], fixture.options).status, 0);
  const catalog = JSON.parse(readFileSync(join(fixture.hub, "catalog.json"), "utf8"));
  assert.equal(catalog.skills[0].description, current.description);
});

test("an interrupted disable restores the recorded managed entry", () => {
  const fixture = setup("disable");
  cli(["install", fixture.source], fixture.options);
  cli(["enable", "sample-skill"], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const enablement = info.enablements[0];
  const payload = { kind: "disable", skill: info.skill, enablement };
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("crashed-disable", "disable", "started", JSON.stringify(payload), new Date().toISOString());
  db.close();
  rmSync(enablement.entryPath);

  const result = cli(["enable", "sample-skill"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(enablement.entryPath, "SKILL.md")), true);
  const after = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  assert.equal(after.enablements.length, 1);
  assert.equal(after.enablements[0].health, "healthy");
});

test("recovery does not recreate a deleted registered project", () => {
  const fixture = setup("deleted-project");
  cli(["install", fixture.source], fixture.options);
  cli(["enable", "sample-skill"], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const payload = { kind: "disable", skill: info.skill, enablement: info.enablements[0] };
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("deleted-project-disable", "disable", "started", JSON.stringify(payload), new Date().toISOString());
  db.close();
  rmSync(fixture.project, { recursive: true });

  const result = cli(["list"], { ...fixture.options, cwd: fixture.root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid entry path/);
  assert.equal(existsSync(fixture.project), false);
});

test("an interrupted enable removes an unrecorded managed entry", () => {
  const fixture = setup("enable");
  cli(["install", fixture.source], fixture.options);
  cli(["enable", "sample-skill"], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const entryPath = info.enablements[0].entryPath;
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.exec("DELETE FROM enablements");
  db.exec("UPDATE operations SET status='started', finished_at=NULL WHERE kind='enable'");
  db.close();

  const after = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  assert.deepEqual(after.enablements, []);
  assert.equal(existsSync(entryPath), false);
});

test("an interrupted forced removal restores content, state, and managed entries", () => {
  const fixture = setup("remove");
  cli(["install", fixture.source], fixture.options);
  cli(["enable", "sample-skill"], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const destination = join(fixture.hub, "skills", "sample-skill");
  const backup = join(fixture.hub, ".staging", "recovery-remove-backup");
  const payload = {
    kind: "remove",
    skill: info.skill,
    destination,
    backup,
    enablements: info.enablements
  };
  delete payload.skill.tags;
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("crashed-remove", "remove", "started", JSON.stringify(payload), new Date().toISOString());
  db.exec("DELETE FROM enablements");
  db.exec("DELETE FROM skills");
  db.close();
  rmSync(info.enablements[0].entryPath);
  renameSync(destination, backup);

  const result = cli(["info", "sample-skill"], fixture.options);
  assert.equal(result.status, 0, result.stderr);
  const restored = JSON.parse(result.stdout);
  assert.equal(restored.skill.instanceId, info.skill.instanceId);
  assert.equal(restored.enablements.length, 1);
  assert.equal(restored.enablements[0].health, "healthy");
  assert.equal(existsSync(backup), false);
});

test("recovery rejects a journal path outside the managed Hub", () => {
  const fixture = setup("unsafe");
  cli(["install", fixture.source], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const outside = join(fixture.root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "keep");
  const payload = { kind: "install", skill: info.skill, destination: outside };
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("unsafe-install", "install", "started", JSON.stringify(payload), new Date().toISOString());
  db.close();

  const result = cli(["disable", "sample-skill"], fixture.options);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid Skill path/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
});

test("recovery rejects a traversal name even when its forged destination matches", () => {
  const fixture = setup("traversal");
  cli(["install", fixture.source], fixture.options);
  const info = JSON.parse(cli(["info", "sample-skill"], fixture.options).stdout);
  const outside = join(fixture.hub, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "meta.json"), JSON.stringify({
    instanceId: info.skill.instanceId,
    name: "../outside",
    description: info.skill.description
  }));
  writeFileSync(join(outside, "keep.txt"), "keep");
  const payload = {
    kind: "install",
    skill: { ...info.skill, name: "../outside" },
    destination: outside
  };
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("traversal-install", "install", "started", JSON.stringify(payload), new Date().toISOString());
  db.close();

  const result = cli(["list"], fixture.options);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid Skill path/);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
});

test("a version 1 database migrates the operation journal payload column once", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-migration-v1-"));
  const paths = resolveHub(join(root, "hub"));
  mkdirSync(paths.root, { recursive: true });
  const db = new DatabaseSync(paths.database);
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE operations (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      finished_at TEXT
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES(1, 'test');
  `);
  db.close();

  const store = new StateStore(paths);
  const columns = store.db.prepare("PRAGMA table_info(operations)").all().map((column) => column.name);
  const versions = store.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  assert.equal(columns.includes("payload_json"), true);
  assert.deepEqual(versions.map((row) => row.version), [1, 2]);
  store.close();

  const reopened = new StateStore(paths);
  assert.equal(reopened.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 2);
  reopened.close();
});

test("a version 2 database preserves legacy Skills while adding source tracking", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-migration-v2-"));
  const paths = resolveHub(join(root, "hub"));
  mkdirSync(paths.root, { recursive: true });
  const db = new DatabaseSync(paths.database);
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE skills (
      instance_id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_location TEXT NOT NULL,
      source_ref TEXT,
      source_revision TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES(2, 'test');
    INSERT INTO skills(instance_id,name,description,source_type,source_location,source_ref,source_revision,installed_at,updated_at)
    VALUES('legacy-id','legacy-skill','Legacy Git Skill','git','https://example.invalid/repo.git','main','abc','test','test');
  `);
  db.close();

  const store = new StateStore(paths);
  const columns = store.db.prepare("PRAGMA table_info(skills)").all().map((column) => column.name);
  assert.equal(columns.includes("source_tracking"), true);
  assert.equal(store.skill("legacy-skill")?.sourceTracking, null);
  assert.deepEqual(store.skill("legacy-skill")?.tags, []);
  assert.deepEqual(store.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version), [2, 3, 4, 5]);
  assert.equal(store.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='index' AND name='skill_tags_tag_skill_id'").get() !== undefined, true);
  store.close();
});

function setup(name) {
  const root = mkdtempSync(join(tmpdir(), `sklp-recovery-${name}-`));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source);
  const options = { cwd: project, hub, home: root };
  cli(["init"], options);
  return { root, hub, project, source, options };
}
