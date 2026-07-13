import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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
