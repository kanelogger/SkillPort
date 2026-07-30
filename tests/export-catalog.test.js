import assert from "node:assert/strict";
import {
  lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("export writes a self-contained searchable catalog without changing the Hub", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  const output = join(root, "shared", "catalog.html");
  mkdirSync(project);
  makeSkill(source, "searchable-skill", "Find this Skill by its unique description");
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", source], options).status, 0);

  const before = snapshotTree(hub);
  const result = cli(["export", output, "--json"], options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    output: resolve(output),
    skillCount: 1
  });
  assert.deepEqual(snapshotTree(hub), before);

  const html = readFileSync(output, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /id="search"/);
  assert.match(html, /normalize\(skill\.name\)\.includes\(query\)/);
  assert.match(html, /normalize\(skill\.description\)\.includes\(query\)/);
  assert.match(html, /id="theme"/);
  assert.match(html, /@media \(max-width: 760px\)/);
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.doesNotMatch(html, /<script\b[^>]+src=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  const payload = catalogPayload(html);
  assert.deepEqual(payload.skills, [{
    name: "searchable-skill",
    description: "Find this Skill by its unique description"
  }]);
});

test("export refuses an existing output unless force is explicit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-export-force-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const output = join(root, "catalog.html");
  mkdirSync(project);
  const options = { cwd: project, hub, home: root };
  assert.equal(cli(["init"], options).status, 0);
  const defaulted = cli(["export", "--json"], options);
  assert.equal(defaulted.status, 0, defaulted.stderr);
  assert.deepEqual(JSON.parse(defaulted.stdout), {
    output: join(realpathSync(project), "skill-port-catalog.html"),
    skillCount: 0
  });
  writeFileSync(output, "keep me");

  const refused = cli(["export", output, "--json"], options);
  assert.equal(refused.status, 1);
  assert.equal(refused.stderr, "");
  assert.deepEqual(JSON.parse(refused.stdout), {
    error: {
      code: "COMMAND_FAILED",
      message: `Output already exists: ${resolve(output)}. Pass --force to replace it.`
    }
  });
  assert.equal(readFileSync(output, "utf8"), "keep me");

  const replaced = cli(["export", output, "--force", "--json"], options);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.deepEqual(JSON.parse(replaced.stdout), {
    output: resolve(output),
    skillCount: 0
  });
  assert.match(readFileSync(output, "utf8"), /Skill Port Catalog/);
});

function catalogPayload(html) {
  const match = html.match(/<script id="catalog-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, "catalog data should be embedded");
  return JSON.parse(match[1]);
}

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
