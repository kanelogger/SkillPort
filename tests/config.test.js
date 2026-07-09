import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli } from "./helpers.js";

test("custom Hub selection persists in the local locator", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-config-"));
  const project = join(root, "project");
  const hub = join(root, "custom-hub");
  mkdirSync(project);
  const options = { cwd: project, home: root, env: { HOME: root }, hub: undefined };

  const initialized = cli(["init", "--hub", hub], options);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(existsSync(join(root, ".skill-port.json")), true);
  assert.equal(cli(["list"], options).status, 0);
});
