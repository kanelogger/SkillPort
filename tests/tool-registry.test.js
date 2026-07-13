import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { globalTarget } from "../dist/infrastructure/targets.js";

test("the only global target resolves to the shared Agent directory", () => {
  const home = mkdtempSync(join(tmpdir(), "sklp-tools-"));
  assert.deepEqual(globalTarget(home), {
    key: "agents",
    path: join(home, ".agents", "skills")
  });
});
