import assert from "node:assert/strict";
import test from "node:test";

import { parseArguments, resolveReleaseVersion } from "../scripts/release.mjs";
import { parseDesktopReleaseArguments, resolveDesktopReleaseVersion } from "../scripts/release-desktop.mjs";

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

test("desktop release arguments support confirmation controls and resume", () => {
  assert.deepEqual(
    parseDesktopReleaseArguments(["minor", "--yes", "--dry-run"]),
    { selector: "minor", yes: true, dryRun: true, resume: false, help: false },
  );
  assert.throws(
    () => parseDesktopReleaseArguments(["patch", "--resume"]),
    /--resume cannot be combined/,
  );
});

test("desktop release version resolves stable increments and rejects invalid targets", () => {
  assert.equal(resolveDesktopReleaseVersion("0.1.1", "patch"), "0.1.2");
  assert.equal(resolveDesktopReleaseVersion("0.1.1", "minor"), "0.2.0");
  assert.equal(resolveDesktopReleaseVersion("0.1.1", "1.0.0"), "1.0.0");
  assert.throws(() => resolveDesktopReleaseVersion("0.1.1", "0.1.1"), /must be greater/);
  assert.throws(() => resolveDesktopReleaseVersion("0.1.1", "0.2.0-beta.1"), /stable x\.y\.z SemVer/);
});
