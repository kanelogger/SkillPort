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
  for (const command of ["init", "install", "link", "unlink", "update", "remove", "prune", "uninstall", "list", "export", "info", "enable", "disable", "doctor", "agent"]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
  for (const command of ["repair", "catalog", "import", "tag"]) {
    assert.doesNotMatch(result.stdout, new RegExp(`^\\s+${command}\\b`, "m"));
  }
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
