import assert from "node:assert/strict";
import test from "node:test";

import { parseArguments, resolveReleaseVersion } from "../scripts/release.mjs";

test("release arguments accept a version selector and repeated notes", () => {
  assert.deepEqual(
    parseArguments(["minor", "--note", "Add a command", "--note=Fix cleanup", "--yes"]),
    {
      selector: "minor",
      notes: ["Add a command", "Fix cleanup"],
      yes: true,
      dryRun: false,
      resume: false,
      help: false,
    },
  );
});

test("resume rejects version-changing arguments", () => {
  assert.throws(
    () => parseArguments(["patch", "--resume"]),
    /--resume cannot be combined/,
  );
});

test("release version resolves stable increments and exact versions", () => {
  assert.equal(resolveReleaseVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(resolveReleaseVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(resolveReleaseVersion("1.2.3", "major"), "2.0.0");
  assert.equal(resolveReleaseVersion("1.2.3", "1.4.0"), "1.4.0");
});

test("release version rejects prereleases and non-increasing versions", () => {
  assert.throws(() => resolveReleaseVersion("1.2.3", "1.2.3"), /must be greater/);
  assert.throws(() => resolveReleaseVersion("1.2.3", "1.2.2"), /must be greater/);
  assert.throws(() => resolveReleaseVersion("1.2.3", "2.0.0-beta.1"), /stable x\.y\.z SemVer/);
});
