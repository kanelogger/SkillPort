import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { cli } from "./helpers.js";

const require = createRequire(import.meta.url);
const manifest = require("../package.json");

test("help exposes the v1 command surface without deferred aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-help-"));
  const result = cli(["--help"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  for (const command of ["init", "install", "link", "unlink", "update", "sync", "remove", "prune", "uninstall", "list", "tag", "export", "info", "enable", "disable", "doctor", "agent"]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
  for (const command of ["repair", "catalog", "import"]) {
    assert.doesNotMatch(result.stdout, new RegExp(`^\\s+${command}\\b`, "m"));
  }
});

test("sync help documents reconciliation and removal controls", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-sync-help-"));
  const result = cli(["sync", "--help"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sklp sync \[options\] \[source\]/);
  for (const option of ["--all", "--path", "--dry-run", "--prune", "--force", "--json"]) {
    assert.match(result.stdout, new RegExp(option));
  }
});

test("tag add help documents batch names and preview controls", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-tag-help-"));
  const result = cli(["tag", "add", "--help"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sklp tag add \[options\] <tag> <skills\.\.\.>/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--json/);
});

test("export help documents output and overwrite controls", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-export-help-"));
  const result = cli(["export", "--help"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /sklp export \[options\] \[output\]/);
  assert.match(result.stdout, /--force/);
  assert.match(result.stdout, /--json/);
});

test("version output matches the package manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-version-"));
  const result = cli(["--version"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), manifest.version);
});
