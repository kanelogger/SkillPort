import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cli } from "./helpers.js";

const bundledSkills = [
  {
    name: "skill-port",
    source: join(process.cwd(), "agent-skill", "skill-port")
  },
  {
    name: "skill-port-report",
    source: join(process.cwd(), "agent-skill", "skill-port-report")
  }
];

test("agent setup registers bundled Skills without requiring an initialized Hub", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-agent-setup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entries = Object.fromEntries(
    bundledSkills.map((skill) => [skill.name, join(root, ".agents", "skills", skill.name)])
  );

  const first = cli(["agent", "setup", "--json"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(first.status, 0, first.stderr);
  const payload = JSON.parse(first.stdout);
  assert.deepEqual(payload.agentIntegration, {
    status: "ready",
    entryPath: entries["skill-port"],
    created: true
  });
  assert.deepEqual(payload.agentIntegrations, bundledSkills.map((skill) => ({
    name: skill.name,
    status: "ready",
    entryPath: entries[skill.name],
    created: true
  })));
  for (const skill of bundledSkills) {
    const entry = entries[skill.name];
    assert.equal(existsSync(join(entry, "SKILL.md")), true);
    assert.equal(realpathSync(entry), realpathSync(skill.source));
  }

  const repeated = cli(["agent", "setup", "--json"], { cwd: root, hub: join(root, "hub"), home: root });
  assert.equal(repeated.status, 0, repeated.stderr);
  const repeatedPayload = JSON.parse(repeated.stdout);
  assert.equal(repeatedPayload.agentIntegration.created, false);
  assert.equal(repeatedPayload.agentIntegrations.every((item) => item.created === false), true);
});

test("agent setup refuses to overwrite an unmanaged entry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-agent-conflict-"));
  const entry = join(root, ".agents", "skills", "skill-port");
  const marker = join(entry, "keep.txt");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(entry, { recursive: true });
  writeFileSync(marker, "user content");

  const result = cli(["agent", "setup", "--json"], { cwd: root, hub: join(root, "hub"), home: root });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(JSON.parse(result.stdout).error.message, /Refusing to overwrite unmanaged Agent integration/);
  assert.equal(readFileSync(marker, "utf8"), "user content");
  assert.equal(existsSync(join(root, ".agents", "skills", "skill-port-report")), false);
});

test("doctor reports Agent integration state without changing it", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-agent-doctor-"));
  const hub = join(root, "hub");
  const entries = bundledSkills.map((skill) => join(root, ".agents", "skills", skill.name));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(cli(["init"], { cwd: root, hub, home: root }).status, 0);

  const missing = cli(["doctor", "--json"], { cwd: root, hub, home: root });
  assert.equal(missing.status, 0, missing.stderr);
  assert.deepEqual(
    JSON.parse(missing.stdout).diagnostics.map((item) => item.code),
    ["AGENT_INTEGRATION_MISSING", "AGENT_INTEGRATION_MISSING"]
  );
  assert.equal(entries.every((entry) => !existsSync(entry)), true);

  assert.equal(cli(["agent", "setup"], { cwd: root, hub, home: root }).status, 0);
  const healthy = cli(["doctor", "--json"], { cwd: root, hub, home: root });
  assert.deepEqual(JSON.parse(healthy.stdout), { healthy: true, diagnostics: [] });

  const conflictEntry = entries[0];
  rmSync(conflictEntry);
  mkdirSync(conflictEntry);
  writeFileSync(join(conflictEntry, "keep.txt"), "user content");
  const conflict = cli(["doctor", "--json"], { cwd: root, hub, home: root });
  assert.equal(conflict.status, 1);
  assert.equal(JSON.parse(conflict.stdout).diagnostics.at(-1).code, "AGENT_INTEGRATION_CONFLICT");
  assert.equal(readFileSync(join(conflictEntry, "keep.txt"), "utf8"), "user content");
});

test("non-global npm lifecycle does not modify the shared Agent directory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-agent-local-install-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "lifecycle", "postinstall.mjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      SKLP_TEST_HOME: root,
      npm_config_global: "false"
    },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, ".agents", "skills", "skill-port")), false);
  assert.equal(existsSync(join(root, ".agents", "skills", "skill-port-report")), false);
});
