import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertCliSurfaceDigest,
  inspectAgentSkillContract,
  recordedCliSurfaceDigest,
  updateCliSurfaceDigest
} from "../scripts/agent-skill-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(root, "dist", "cli.js");
const skillPath = resolve(root, "agent-skill", "skill-port", "SKILL.md");

test("bundled Agent Skill matches the built CLI command surface", () => {
  const contract = inspectAgentSkillContract({ cliPath, skillPath });
  assert.equal(recordedCliSurfaceDigest(contract.skillDocument), contract.digest);
  assert.ok(contract.entries.some((entry) => entry.command === "sklp tag add"));
  assert.ok(contract.entries.some((entry) => entry.command === "sklp agent setup"));
});

test("Agent Skill contract rejects stale digests and updates only its marker", () => {
  const firstDigest = "a".repeat(64);
  const secondDigest = "b".repeat(64);
  const document = "---\nname: skill-port\ndescription: Fixture\n---\n\n# Skill Port\n\nBody\n";
  const first = updateCliSurfaceDigest(document, firstDigest);

  assert.equal(recordedCliSurfaceDigest(first), firstDigest);
  assert.match(first, /# Skill Port\n\n<!-- sklp-cli-surface-sha256:/);
  assert.equal(first.replace(/\n<!-- sklp-cli-surface-sha256: [a-f0-9]{64} -->\n/, ""), document);
  assert.throws(
    () => assertCliSurfaceDigest(first, secondDigest),
    /Run `npm run sync:agent-skill`/
  );

  const second = updateCliSurfaceDigest(first, secondDigest);
  assert.equal(recordedCliSurfaceDigest(second), secondDigest);
  assert.equal(second.replace(secondDigest, firstDigest), first);
});
