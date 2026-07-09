import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { globalTarget, toolKeys } from "../dist/infrastructure/targets.js";

test("all advertised tool keys resolve beneath the supplied home", () => {
  const home = mkdtempSync(join(tmpdir(), "sklp-tools-"));
  const expected = {
    claude: ".claude/skills",
    codex: ".agents/skills",
    cursor: ".cursor/skills",
    agents: ".agents/skills",
    pi: ".pi/agent/skills",
    opencode: ".config/opencode/skills",
    trae: ".trae/skills",
    "trae-cn": ".trae-cn/skills"
  };
  for (const key of toolKeys) {
    assert.equal(globalTarget(key, home).path, join(home, expected[key]));
  }
});

test("opencode uses an existing fallback only when primary is absent", () => {
  const home = mkdtempSync(join(tmpdir(), "sklp-opencode-"));
  mkdirSync(join(home, ".opencode", "skills"), { recursive: true });
  assert.equal(globalTarget("opencode", home).path, join(home, ".opencode", "skills"));
  mkdirSync(join(home, ".config", "opencode", "skills"), { recursive: true });
  assert.equal(globalTarget("opencode", home).path, join(home, ".config", "opencode", "skills"));
});
