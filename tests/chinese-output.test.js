import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

  const agentSetup = cli(["agent", "setup"], { cwd: project, hub, home: root, env });
  assert.equal(agentSetup.status, 0, agentSetup.stderr);
  assert.match(agentSetup.stdout, /已注册 Agent 集成/);

  const initialized = cli(["init"], { cwd: project, hub, home: root, env });
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.match(initialized.stdout, /已初始化 Skill Port/);

  const installed = cli(["install", source], { cwd: project, hub, home: root, env });
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /已安装 zh-skill/);

  const tagPreview = cli(["tag", "add", "develop", "zh-skill", "--dry-run"], { cwd: project, hub, home: root, env });
  assert.equal(tagPreview.status, 0, tagPreview.stderr);
  assert.match(tagPreview.stdout, /将为 zh-skill 添加标签 develop/);

  const listed = cli(["list", "--status"], { cwd: project, hub, home: root, env });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /名称\t类型\t启用数\t健康状态/);
  assert.match(listed.stdout, /zh-skill\t本地副本\t0\t未启用/);

  const prunePreview = cli(["prune", "--dry-run"], { cwd: project, hub, home: root, env });
  assert.equal(prunePreview.status, 0, prunePreview.stderr);
  assert.match(prunePreview.stdout, /清理预览/);
  assert.match(prunePreview.stdout, /将移除 zh-skill/);

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

  const listed = cli(["list", "--status", "--json"], {
    cwd: project,
    hub,
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).skills.map((skill) => ({
    installationKind: skill.installationKind,
    enablementCount: skill.enablementCount,
    health: skill.health
  })), [{ installationKind: "local-copy", enablementCount: 0, health: "not-enabled" }]);

  const prunePreview = cli(["prune", "--dry-run", "--json"], {
    cwd: project,
    hub,
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(prunePreview.status, 0, prunePreview.stderr);
  assert.deepEqual(JSON.parse(prunePreview.stdout), {
    dryRun: true,
    planned: [{ name: "zh-json-skill" }],
    skipped: []
  });
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
  assert.match(result.stdout, /清理未启用的 Skill 副本/);
  assert.match(result.stdout, /导出可分享的静态 Skill 目录/);

  const updateHelp = cli(["update", "--help"], {
    cwd: root,
    hub: join(root, "hub"),
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(updateHelp.status, 0, updateHelp.stderr);
  assert.match(updateHelp.stdout, /--ref <ref>/);
  assert.match(updateHelp.stdout, /改为跟踪指定 Git 分支/);

  const syncHelp = cli(["sync", "--help"], {
    cwd: root,
    hub: join(root, "hub"),
    home: root,
    env: { SKLP_LANG: "zh-CN" }
  });
  assert.equal(syncHelp.status, 0, syncHelp.stderr);
  assert.match(syncHelp.stdout, /同步 Git 来源集合/);
  assert.match(syncHelp.stdout, /安全移除上游已缺失的 Skill/);
});

test("export localizes human output and the static catalog", (t) => {
  const root = mkdtempSync(join(tmpdir(), "sklp-zh-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  const output = join(root, "catalog.html");
  const env = { SKLP_LANG: "zh-CN" };
  mkdirSync(project);
  makeSkill(source, "zh-export-skill", "可搜索的中文描述");
  const options = { cwd: project, hub, home: root, env };
  assert.equal(cli(["init"], options).status, 0);
  assert.equal(cli(["install", source], options).status, 0);

  const result = cli(["export", output], options);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已导出静态目录/);
  assert.match(result.stdout, /Skill 数量: 1/);
  const html = readFileSync(output, "utf8");
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /搜索技能名称或描述/);
  assert.match(html, /可搜索的中文描述/);
});

test("Chinese doctor output includes actionable suggestions", () => {
  const root = mkdtempSync(join(tmpdir(), "sklp-zh-doctor-"));
  const hub = join(root, "hub");
  const project = join(root, "project");
  const source = join(root, "source");
  const env = { SKLP_LANG: "zh-CN" };
  mkdirSync(project);
  makeSkill(source, "drift-skill", "Drift");
  cli(["init"], { cwd: project, hub, home: root, env });
  cli(["install", source], { cwd: project, hub, home: root, env });
  cli(["enable", "drift-skill"], { cwd: project, hub, home: root, env });
  rmSync(join(project, ".agents", "skills", "drift-skill"));

  const result = cli(["doctor"], { cwd: project, hub, home: root, env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /建议:/);
  assert.match(result.stderr, /sklp disable/);
});
