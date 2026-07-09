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
  for (const command of ["init", "install", "link", "unlink", "update", "remove", "list", "info", "enable", "disable", "doctor"]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
  for (const command of ["repair", "catalog", "export", "import", "tag"]) {
    assert.doesNotMatch(result.stdout, new RegExp(`^\\s+${command}\\b`, "m"));
  }
});

test("version output matches the package manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-version-"));
  const result = cli(["--version"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), manifest.version);
});
