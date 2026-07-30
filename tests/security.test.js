import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sanitizeError } from "../dist/domain/errors.js";
import { cli, makeSkill } from "./helpers.js";

test("credential-bearing URLs are redacted", () => {
  const message = sanitizeError(
    "failed https://user:secret@example.com/repo?token=abc&access_token=def&api_key=ghi&x=1"
  );
  assert.equal(message.includes("secret"), false);
  assert.equal(message.includes("token=abc"), false);
  assert.equal(message.includes("access_token=def"), false);
  assert.equal(message.includes("api_key=ghi"), false);
});

test("credential-bearing SSH URLs are redacted", () => {
  const message = sanitizeError("failed ssh://user:secret@example.com/repo.git");
  assert.equal(message.includes("secret"), false);
  assert.equal(message.includes("ssh://[redacted]@example.com"), true);
});

test("static catalog export excludes private state and neutralizes embedded markup", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-export-security-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project-private");
  const source = join(root, "source-private");
  const output = join(root, "catalog.html");
  const description = "Visible & safe </script><script>globalThis.CATALOG_XSS=true</script>";
  mkdirSync(project);
  mkdirSync(source);
  writeFileSync(join(source, "SKILL.md"), [
    "---",
    "name: safe-export",
    "description: >-",
    `  ${description}`,
    "---",
    "",
    "# safe-export",
    ""
  ].join("\n"));
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", source], options).status, 0);
  const database = new DatabaseSync(join(hub, "state.db"));
  const row = database.prepare("SELECT instance_id FROM skills WHERE name=?").get("safe-export");
  database.prepare("INSERT INTO skill_tags(skill_id, tag) VALUES(?, ?)").run(row.instance_id, "private-publisher-tag");
  database.close();

  const result = cli(["export", output, "--json"], options);
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(output, "utf8");
  const dataMatch = html.match(/<script id="catalog-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(dataMatch);
  const payload = JSON.parse(dataMatch[1]);
  assert.deepEqual(payload.skills, [{ name: "safe-export", description }]);
  assert.deepEqual(Object.keys(payload.skills[0]).sort(), ["description", "name"]);
  assert.equal(html.includes("</script><script>globalThis.CATALOG_XSS=true</script>"), false);
  assert.equal(html.includes("private-publisher-tag"), false);
  assert.equal(html.includes(row.instance_id), false);
  assert.equal(html.includes(project), false);
  assert.equal(html.includes(source), false);
});

test("path traversal names are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-name-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "../escape", "Unsafe");
  cli(["init"], { cwd: project, hub, home: root });
  assert.equal(cli(["install", source], { cwd: project, hub, home: root }).status, 1);
});

test("all Windows device basenames are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-reserved-name-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  mkdirSync(project);
  cli(["init"], { cwd: project, hub, home: root });
  for (const name of ["con", "com2", "com9", "lpt2", "lpt9"]) {
    const source = join(root, name);
    makeSkill(source, name, "Unsafe on Windows");
    assert.equal(cli(["install", source], { cwd: project, hub, home: root }).status, 1);
  }
});

test("source symlinks may not escape the Skill root", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-symlink-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  const outside = join(root, "outside");
  mkdirSync(project);
  mkdirSync(outside);
  makeSkill(source);
  symlinkSync(outside, join(source, "escape"));
  cli(["init"], { cwd: project, hub, home: root });
  const result = cli(["install", source], { cwd: project, hub, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /(absolute symlink|escapes its root)/);
});

test("real paths prevent a symlinked Hub from being nested in the source", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-hub-alias-"));
  const project = join(root, "project");
  const source = join(root, "source");
  const realHub = join(source, "hub");
  const hubAlias = join(root, "hub-alias");
  mkdirSync(project);
  mkdirSync(realHub, { recursive: true });
  makeSkill(source);
  symlinkSync(realHub, hubAlias, "dir");
  cli(["init"], { cwd: project, hub: hubAlias, home: root });

  const result = cli(["install", source], { cwd: project, hub: hubAlias, home: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not contain one another/);
  assert.equal(cli(["list"], { cwd: project, hub: hubAlias, home: root }).stdout, "");
});

test("prune preserves an unused copy when ownership metadata is missing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-prune-ownership-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "unverified-copy", "Unverified copy");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", source], options).status, 0);
  rmSync(join(hub, "skills", "unverified-copy", "meta.json"));

  const preview = cli(["prune", "--dry-run", "--json"], options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout), {
    dryRun: true,
    planned: [],
    skipped: [{ name: "unverified-copy", reason: "unverified" }]
  });
  assert.equal(JSON.parse(cli(["list", "--status", "--json"], options).stdout).skills[0].health, "conflict");

  const result = cli(["prune", "--yes", "--json"], options);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    removed: [],
    skipped: [{ name: "unverified-copy", reason: "unverified" }],
    failed: []
  });
  assert.equal(existsSync(join(hub, "skills", "unverified-copy", "SKILL.md")), true);
  assert.deepEqual(JSON.parse(cli(["list", "--json"], options).stdout).skills.map((skill) => skill.name), ["unverified-copy"]);
});
