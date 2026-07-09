import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { createDirectoryLink } from "../dist/infrastructure/filesystem.js";

test("Windows link creation falls back from dir symlink to absolute junction", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-win-link-"));
  const calls = [];
  const create = (target, path, type) => {
    calls.push({ target: String(target), path: String(path), type });
    if (type === "dir") throw Object.assign(new Error("privilege"), { code: "EPERM" });
  };
  const type = createDirectoryLink(join(root, "source"), join(root, "target", "skill"), "win32", create);
  assert.equal(type, "junction");
  assert.deepEqual(calls.map((call) => call.type), ["dir", "junction"]);
  assert.equal(isAbsolute(calls[1].target), true);
});

test("Windows link creation does not hide non-permission failures", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-win-link-error-"));
  const calls = [];
  const create = (target, path, type) => {
    calls.push({ target, path, type });
    throw Object.assign(new Error("missing source"), { code: "ENOENT" });
  };
  assert.throws(
    () => createDirectoryLink(join(root, "source"), join(root, "target", "skill"), "win32", create),
    { code: "ENOENT" }
  );
  assert.deepEqual(calls.map((call) => call.type), ["dir"]);
});

test("Unix link creation uses one directory symlink attempt", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-unix-link-"));
  const calls = [];
  const create = (target, path, type) => calls.push({ target, path, type });
  const type = createDirectoryLink(join(root, "source"), join(root, "target", "skill"), "darwin", create);
  assert.equal(type, "symlink");
  assert.deepEqual(calls.map((call) => call.type), ["dir"]);
});
