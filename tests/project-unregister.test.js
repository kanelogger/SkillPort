import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sklp-project-unregister-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  const options = { cwd: root, hub, home: root };
  assert.equal(cli(["init", "--project", project], options).status, 0);
  assert.equal(cli(["agent", "setup"], options).status, 0);
  return { root, hub, project, options };
}

function state(fixture, fn) {
  const db = new DatabaseSync(join(fixture.hub, "state.db"));
  try { return fn(db); } finally { db.close(); }
}

function databaseHash(fixture) {
  return createHash("sha256").update(readFileSync(join(fixture.hub, "state.db"))).digest("hex");
}

function hubSnapshot(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const path = join(root, entry.name);
    return [entry.name, entry.isDirectory() ? hubSnapshot(path) : createHash("sha256").update(readFileSync(path)).digest("hex")];
  });
}

function registeredProjects(fixture) {
  return state(fixture, (db) => db.prepare("SELECT path FROM projects ORDER BY path").all().map((row) => row.path));
}

test("project unregistration removes a missing registration and preserves Skills, other projects, enablements and catalogs", (t) => {
  const f = setup(t);
  const other = join(f.root, "other");
  const source = join(f.root, "source");
  mkdirSync(other);
  makeSkill(source);
  assert.equal(cli(["init", "--project", other], f.options).status, 0);
  assert.equal(cli(["install", source], f.options).status, 0);
  assert.equal(cli(["enable", "sample-skill", "--global"], f.options).status, 0);
  assert.equal(cli(["enable", "sample-skill", "--project", other], f.options).status, 0);
  rmSync(f.project, { recursive: true });
  const diagnostic = JSON.parse(cli(["doctor", "--json"], f.options).stdout);
  assert.deepEqual(diagnostic.diagnostics.map((item) => item.code), ["PROJECT_MISSING"]);
  assert.match(diagnostic.diagnostics[0].suggestion, /sklp project unregister/);

  const infoBefore = JSON.parse(cli(["info", "sample-skill", "--json"], f.options).stdout);
  const catalogBefore = ["catalog.json", "catalog.md"].map((name) => readFileSync(join(f.hub, name), "utf8"));
  const before = databaseHash(f);
  const preview = cli(["project", "unregister", "./project/../project", "--dry-run", "--json"], f.options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stderr, "");
  assert.deepEqual(JSON.parse(preview.stdout), { dryRun: true, unregistered: { path: f.project } });
  assert.equal(databaseHash(f), before);
  assert.deepEqual(registeredProjects(f), [other, f.project]);

  const applied = cli(["project", "unregister", f.project, "--json"], f.options);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.stderr, "");
  assert.deepEqual(JSON.parse(applied.stdout), { unregistered: { path: f.project } });
  assert.deepEqual(registeredProjects(f), [other]);
  assert.deepEqual(JSON.parse(cli(["info", "sample-skill", "--json"], f.options).stdout), infoBefore);
  assert.deepEqual(["catalog.json", "catalog.md"].map((name) => readFileSync(join(f.hub, name), "utf8")), catalogBefore);
  assert.equal(existsSync(join(f.hub, "skills", "sample-skill", "SKILL.md")), true);
  assert.equal(existsSync(join(source, "SKILL.md")), true);
  assert.equal(existsSync(f.project), false);
  assert.deepEqual(JSON.parse(cli(["doctor", "--json"], f.options).stdout), { healthy: true, diagnostics: [] });
  assert.deepEqual(state(f, (db) => db.prepare("SELECT status FROM operations WHERE kind='project-unregister'").all().map((row) => row.status)), ["completed"]);
});

test("project unregistration keeps existing project files, unmanaged entries, Git config and nested registrations", (t) => {
  const f = setup(t);
  const nested = join(f.project, "child");
  const unmanaged = join(f.project, ".agents", "skills", "manual", "SKILL.md");
  mkdirSync(nested);
  makeSkill(join(f.project, ".agents", "skills", "manual"));
  mkdirSync(join(f.project, ".git"));
  writeFileSync(join(f.project, ".git", "config"), "[core]\n\tfilemode = true\n");
  assert.equal(cli(["init", "--project", nested], f.options).status, 0);
  const manualBefore = readFileSync(unmanaged, "utf8");
  const result = cli(["project", "unregister", f.project], f.options);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unregistered project/);
  assert.equal(readFileSync(unmanaged, "utf8"), manualBefore);
  assert.equal(readFileSync(join(f.project, ".git", "config"), "utf8"), "[core]\n\tfilemode = true\n");
  assert.deepEqual(registeredProjects(f), [nested]);
  assert.equal(cli(["init", "--project", f.project], f.options).status, 0);
});

test("project unregistration refuses recorded project enablements even after the directory disappears", (t) => {
  const f = setup(t);
  const source = join(f.root, "source");
  makeSkill(source);
  assert.equal(cli(["install", source], f.options).status, 0);
  assert.equal(cli(["enable", "sample-skill", "--project", f.project], f.options).status, 0);
  for (const missing of [false, true]) {
    if (missing) rmSync(f.project, { recursive: true });
    for (const flags of [["--dry-run", "--json"], ["--json"]]) {
      const result = cli(["project", "unregister", f.project, ...flags], f.options);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "");
      const error = JSON.parse(result.stdout).error;
      assert.equal(error.code, "COMMAND_FAILED");
      assert.match(error.message, /project enablements/);
      assert.match(error.message, /sklp disable/);
      assert.deepEqual(registeredProjects(f), [f.project]);
      assert.equal(state(f, (db) => db.prepare("SELECT COUNT(*) AS count FROM enablements").get().count), 1);
    }
  }
  mkdirSync(f.project);
  assert.equal(cli(["disable", "sample-skill", "--project", f.project], f.options).status, 0);
  assert.equal(cli(["project", "unregister", f.project], f.options).status, 0);
  assert.deepEqual(registeredProjects(f), []);
});

test("project unregistration matches exactly and refuses unknown paths instead of selecting an ancestor", (t) => {
  const f = setup(t);
  mkdirSync(join(f.project, "child"));
  for (const target of [join(f.project, "child"), join(f.root, "unknown")]) {
    for (const flags of [["--dry-run", "--json"], ["--json"]]) {
      const result = cli(["project", "unregister", target, ...flags], f.options);
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "");
      assert.match(JSON.parse(result.stdout).error.message, /not registered/);
      assert.deepEqual(registeredProjects(f), [f.project]);
    }
  }
  assert.equal(cli(["project", "unregister", f.project], f.options).status, 0);
  assert.equal(cli(["project", "unregister", f.project, "--json"], f.options).status, 1);
});

test("project unregistration resolves symlink aliases and missing paths through existing symlinked ancestors", (t) => {
  const f = setup(t);
  const alias = join(f.root, "alias");
  symlinkSync(f.project, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(cli(["project", "unregister", alias], f.options).status, 0);
  assert.equal(existsSync(alias), true);
  assert.equal(cli(["init", "--project", f.project], f.options).status, 0);
  const parentAlias = join(f.root, "parent-alias");
  symlinkSync(f.root, parentAlias, process.platform === "win32" ? "junction" : "dir");
  rmSync(f.project, { recursive: true });
  const result = cli(["project", "unregister", join(parentAlias, "project"), "--json"], f.options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { unregistered: { path: f.project } });
  assert.deepEqual(registeredProjects(f), []);
});

test("project unregistration preview does not recover interrupted operations or change any Hub file", (t) => {
  const f = setup(t);
  state(f, (db) => db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
    .run("pending", "init", "started", '{"kind":"init","phase":"started"}', new Date().toISOString()));
  const before = hubSnapshot(f.hub);
  assert.equal(cli(["project", "unregister", f.project, "--dry-run", "--json"], f.options).status, 0);
  assert.deepEqual(hubSnapshot(f.hub), before);
  assert.equal(state(f, (db) => db.prepare("SELECT status FROM operations WHERE id='pending'").get().status), "started");
});

test("project unregistration respects the Hub lock and rolls back a failed database delete", (t) => {
  const f = setup(t);
  const lock = join(f.hub, ".mutation.lock");
  writeFileSync(lock, `${process.pid}\n`);
  const locked = cli(["project", "unregister", f.project, "--json"], f.options);
  assert.equal(locked.status, 1);
  assert.match(JSON.parse(locked.stdout).error.message, /mutation is in progress/);
  rmSync(lock);
  state(f, (db) => db.exec("CREATE TRIGGER reject_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END"));
  const failed = cli(["project", "unregister", f.project, "--json"], f.options);
  assert.equal(failed.status, 1);
  assert.match(JSON.parse(failed.stdout).error.message, /injected delete failure/);
  assert.deepEqual(registeredProjects(f), [f.project]);
  state(f, (db) => db.exec("DROP TRIGGER reject_project_delete"));
  assert.equal(cli(["project", "unregister", f.project, "--json"], f.options).status, 0);
});

test("project unregistration has bilingual output and language-stable JSON", (t) => {
  const f = setup(t);
  const zh = { ...f.options, env: { SKLP_LANG: "zh-CN" } };
  const help = cli(["project", "unregister", "--help"], zh);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /注销/);
  const preview = cli(["project", "unregister", f.project, "--dry-run"], zh);
  assert.match(preview.stdout, /将注销项目登记/);
  const json = cli(["project", "unregister", f.project, "--dry-run", "--json"], zh);
  assert.deepEqual(JSON.parse(json.stdout), { dryRun: true, unregistered: { path: f.project } });
  const applied = cli(["project", "unregister", f.project], zh);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /已注销项目登记/);
});
