import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cli, makeSkill } from "./helpers.js";

test("Chinese human output is available through SKLP_LANG", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-zh-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  const env = { SKLP_LANG: "zh-CN" };
  mkdirSync(project);
  makeSkill(source, "zh-skill", "中文体验");

  const initialized = cli(["init"], { cwd: project, hub, home: root, env });
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /已初始化 Skill Port/);

  const installed = cli(["install", source], { cwd: project, hub, home: root, env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /已安装 zh-skill/);

  const enabled = cli(["enable", "zh-skill"], { cwd: project, hub, home: root, env });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.match(enabled.stdout, /已启用 zh-skill/);

  const doctor = cli(["doctor"], { cwd: project, hub, home: root, env });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Skill Port 状态正常/);
});

test("JSON output stays machine-readable in Chinese mode", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-zh-json-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  mkdirSync(project);
  makeSkill(source, "zh-json-skill", "JSON remains stable");
  cli(["init"], { cwd: project, hub, home: root, env: { SKLP_LANG: "zh-CN" } });

  const installed = cli(["install", source, "--json"], {
    cwd: project,
    hub,
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).skills[0].name, "zh-json-skill");
});

test("Chinese help is available through SKLP_LANG", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-zh-help-"));
  const result = cli(["--help"], {
    cwd: root,
    hub: join(root, "hub"),
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /本地 Agent Skill Hub/);
  assert.match(result.stdout, /初始化 Skill Port/);
  assert.match(result.stdout, /安装 Skill/);
});
