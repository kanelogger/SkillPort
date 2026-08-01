#!/usr/bin/env node
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { CliError, sanitizeError } from "./domain/errors.js";
import {
  SkillPort,
  type BatchUpdateSummary,
  type FleetUpdateCheck,
  type PrunePreview,
  type PruneResult,
  type PruneSkipReason,
  type SkillInstallationKind,
  type SkillStatus,
  type SkillStatusHealth,
  type SyncSummary,
  type UpdateSummary
} from "./application/skill-port.js";
import {
  diagnoseAgentIntegration, removeAgentIntegration, setupAgentIntegration
} from "./application/agent-integration.js";
import type { Skill } from "./domain/models.js";

const program = new Command()
  .name("sklp")
  .description(human("Local Agent Skill hub and project binding CLI", "本地 Agent Skill Hub 和项目绑定 CLI"))
  .version(packageVersion())
  .showHelpAfterError();

program.command("init")
  .description(human("Initialize Skill Port and register the current project", "初始化 Skill Port 并注册当前项目"))
  .option("--hub <path>", human("Use a custom Hub path", "使用自定义 Hub 路径"))
  .option("--project <path>", human("Register a project other than the current directory", "注册非当前目录的项目"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => {
    const app = SkillPort.init(options);
    if (options.json) printJson({ hub: app.paths.root });
    else console.log(human(`Initialized Skill Port\nHub: ${app.paths.root}`, `已初始化 Skill Port\nHub: ${app.paths.root}`));
    app.close();
  }));

program.command("install")
  .description(human("Install a Skill from a local directory or Git URL", "从本地目录、Git URL 或 registry 安装 Skill"))
  .argument("<source>")
  .option("--ref <ref>", human("Git branch, tag, or commit", "Git 分支、标签或提交"))
  .option("--path <path>", human("Install a Skill from a path inside a Git repository", "安装 Git 仓库内指定路径的 Skill"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .option("--dry-run", human("Preview installable Skills without changing state", "预览可安装 Skill，不改写状态"))
  .option("--skip-existing", human("Skip Skills that are already installed", "跳过已安装的 Skill"))
  .action(run((source, options) => withApp((app) => {
    if (options.dryRun) {
      const result = app.previewInstall(source, options.ref, {
        skipExisting: Boolean(options.skipExisting),
        gitPath: options.path
      });
      if (options.json) printJson(installPayload({ ...result, dryRun: true }));
      else printInstallPreview(result);
      return;
    }
    const result = app.installAll(source, options.ref, {
      skipExisting: Boolean(options.skipExisting),
      gitPath: options.path
    });
    if (options.json) printJson(installPayload({ skills: result.skills.map(publicSkill), skipped: result.skipped }));
    else printInstallResult(result);
  }, options.dryRun ? { recover: false } : undefined)));

program.command("link")
  .description(human("Link a local Skill directory into the Hub", "把本地 Skill 目录链接到 Hub"))
  .argument("<source>")
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((source, options) => withApp((app) => {
    const skill = app.link(source);
    if (options.json) printJson({ skill: publicSkill(skill) });
    else console.log(human(`Linked ${skill.name}\nInstance: ${skill.instanceId}`, `已链接 ${skill.name}\n实例: ${skill.instanceId}`));
  })));

program.command("update")
  .description(human("Update an installed Skill", "更新已安装 Skill"))
  .argument("[skill]")
  .option("--all", human("Check, preview, or update every installed Skill", "检查、预览或更新所有已安装 Skill"))
  .option("--check", human("Check whether a Git Skill has a remote update", "检查 Git Skill 是否有远程更新"))
  .option("--dry-run", human("Preview update results without changing state", "预览更新结果，不改写状态"))
  .option("--ref <ref>", human("Change Git Skills to track this branch, tag, or commit", "改为跟踪指定 Git 分支、标签或提交"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill, options) => {
    validateUpdateTarget(skill, options);
    if (options.check && options.dryRun) {
      throw new CliError(human("Choose either --check or --dry-run.", "请选择 --check 或 --dry-run 其中之一。"));
    }
    if (options.ref && (options.check || options.dryRun)) {
      throw new CliError(human("--ref cannot be combined with --check or --dry-run.", "--ref 不能与 --check 或 --dry-run 同时使用。"));
    }
    if (options.check) {
      const updates = withApp((app) => options.all ? app.checkAllUpdates() : [app.checkUpdate(skill)], { recover: false, readOnly: true });
      if (options.json) printJson(options.all ? { updates } : { update: updates[0] });
      else for (const update of updates) printUpdateCheck(update);
      if (updates.some((update) => update.status === "unknown")) process.exitCode = 1;
      return;
    }
    if (options.dryRun) {
      const preview = withApp((app) => options.all ? app.previewAllUpdates() : app.previewUpdate(skill), { recover: false, readOnly: true });
      if (options.json) printJson(preview);
      else printUpdateSummary(preview);
      if (preview.failed.length > 0) process.exitCode = 1;
      return;
    }
    if (options.all) {
      const result = withApp((app) => options.ref ? app.updateAllToRef(options.ref) : app.updateAll());
      if (options.json) printJson(result);
      else printBatchUpdateSummary(result);
      if (result.failed.length > 0) process.exitCode = 1;
      return;
    }
    return withApp((app) => {
    const updated = options.ref ? app.updateToRef(skill, options.ref) : app.update(skill);
    if (options.json) printJson({ skill: publicSkill(updated) });
    else console.log(human(`Updated ${updated.name}`, `已更新 ${updated.name}`));
    });
  }));

program.command("sync")
  .description(human("Reconcile a Git source collection", "同步 Git 来源集合"))
  .argument("[source]")
  .option("--all", human("Sync every registered Git source collection", "同步所有已登记 Git 来源集合"))
  .option("--ref <ref>", human("Git branch, tag, or commit", "Git 分支、标签或提交"))
  .option("--path <path>", human("Scan this path inside the Git repository", "扫描 Git 仓库内指定路径"))
  .option("--dry-run", human("Preview the full reconciliation without changing state", "预览完整同步差异，不改写状态"))
  .option("--prune", human("Remove upstream-missing Skills when safe", "安全移除上游已缺失的 Skill"))
  .option("--force", human("Disable managed targets before pruning missing Skills", "清理缺失 Skill 前先停用受管目标"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((source, options) => {
    validateSyncTarget(source, options);
    if (options.force && !options.prune) {
      throw new CliError(human("--force requires --prune.", "--force 必须与 --prune 一起使用。"));
    }
    if (options.all && (options.ref || options.path)) {
      throw new CliError(human(
        "--ref and --path cannot be combined with --all; registered sources keep their own scope.",
        "--ref 和 --path 不能与 --all 一起使用；已登记来源会保留各自范围。"
      ));
    }
    const syncOptions = {
      ref: options.ref,
      gitPath: options.path,
      prune: Boolean(options.prune),
      force: Boolean(options.force)
    };
    const result = options.dryRun
      ? withApp((app) => options.all
        ? app.previewSyncAll(syncOptions)
        : app.previewSync(source!, syncOptions), { recover: false, readOnly: true })
      : withApp((app) => options.all
        ? app.syncAllSources(syncOptions)
        : app.syncSource(source!, syncOptions));
    if (options.json) printJson(options.dryRun ? { dryRun: true, ...result } : result);
    else printSyncSummary(result, Boolean(options.dryRun));
    if (syncHasFailures(result)) process.exitCode = 1;
  }));

program.command("remove")
  .description(human("Remove an installed Skill", "移除已安装 Skill"))
  .argument("<skill>")
  .option("--force", human("Disable managed targets before removal", "移除前先停用受管目标"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill, options) => withApp((app) => {
    app.remove(skill, Boolean(options.force));
    if (options.json) printJson({ removed: skill });
    else console.log(human(`Removed ${skill}`, `已移除 ${skill}`));
  })));

program.command("prune")
  .description(human("Remove unused copied Skills", "清理未启用的 Skill 副本"))
  .option("--dry-run", human("Preview removals without changing state", "预览清理结果，不改写状态"))
  .option("--yes", human("Confirm removal of every planned Skill", "确认移除所有计划清理的 Skill"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => {
    if (!options.dryRun && !options.yes) {
      throw new CliError(human(
        "Pass --yes to remove unused copied Skills, or use --dry-run to preview.",
        "请使用 --yes 确认清理未启用的 Skill 副本，或先使用 --dry-run 预览。"
      ));
    }
    if (options.dryRun) {
      const preview = withApp((app) => app.previewPrune(), { recover: false, readOnly: true });
      if (options.json) printJson({ dryRun: true, ...preview });
      else printPrunePreview(preview);
      return;
    }
    const result = withApp((app) => app.prune());
    if (options.json) printJson(result);
    else printPruneResult(result);
    if (result.failed.length > 0) process.exitCode = 1;
  }));

program.command("unlink")
  .description(human("Unlink a linked Skill", "取消链接 linked Skill"))
  .argument("<skill>")
  .option("--force", human("Disable managed targets before unlinking", "取消链接前先停用受管目标"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill, options) => withApp((app) => {
    app.unlink(skill, Boolean(options.force));
    if (options.json) printJson({ unlinked: skill });
    else console.log(human(`Unlinked ${skill}`, `已取消链接 ${skill}`));
  })));

program.command("uninstall")
  .description(human("Uninstall sklp and its managed Skills", "卸载 sklp 及其管理的 Skills"))
  .action(run(async () => {
    const confirmed = await confirmUninstall();
    if (!confirmed) {
      console.log(human("Uninstall cancelled.", "已取消卸载。"));
      return;
    }
    const failures: string[] = [];
    try {
      removeAgentIntegration();
    } catch (error) {
      failures.push(human(
        `Could not remove Skill Port Agent integration: ${sanitizeError(error)}`,
        `无法移除 Skill Port Agent 集成：${sanitizeError(error)}`
      ));
    }
    try {
      failures.push(...SkillPort.uninstall().failures);
    } catch (error) {
      failures.push(human(
        `Could not remove Skill Port data: ${sanitizeError(error)}`,
        `无法移除 Skill Port 数据：${sanitizeError(error)}`
      ));
    }
    const npmFailure = uninstallGlobalPackage();
    if (npmFailure) failures.push(npmFailure);
    if (failures.length > 0) {
      throw new CliError(human(
        `Uninstall completed with errors:\n${failures.join("\n")}`,
        `卸载完成，但存在错误：\n${failures.join("\n")}`
      ));
    }
    console.log(human("Uninstalled sklp.", "已卸载 sklp。"));
  }));

const agentCommand = program.command("agent")
  .description(human("Manage Skill Port's local Agent integration", "管理 Skill Port 的本地 Agent 集成"));

agentCommand.command("setup")
  .description(human("Make sklp discoverable through the shared Agent Skill directory", "通过共享 Agent Skill 目录让 Agent 发现 sklp"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => {
    const integration = setupAgentIntegration();
    if (options.json) printJson({ agentIntegration: integration });
    else console.log(human(
      `${integration.created ? "Registered" : "Agent integration already registered"}\nEntry: ${integration.entryPath}`,
      `${integration.created ? "已注册 Agent 集成" : "Agent 集成已注册"}\n入口: ${integration.entryPath}`
    ));
  }));

program.command("list")
  .description(human("List installed Skills", "列出已安装 Skill"))
  .option("--tag <tag>", human("Filter Skills by private tag", "按私有标签筛选 Skill"))
  .option("--status", human("Include installation, enablement, and health status", "包含安装类型、启用数量和健康状态"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => withApp((app) => {
    if (options.status) {
      const statuses = app.listStatus(options.tag);
      if (options.json) printJson({ skills: statuses.map(skillStatusPayload) });
      else printSkillStatuses(statuses);
      return;
    }
    const skills = app.list(options.tag);
    if (options.json) printJson({ skills: skills.map(publicSkill) });
    else for (const skill of skills) console.log(`${skill.name}\t${skill.description}${skill.tags.length ? `\t${skill.tags.join(", ")}` : ""}`);
  })));

const tagCommand = program.command("tag")
  .description(human("Manage private Skill tags", "管理 Skill 私有标签"));

tagCommand.command("add")
  .description(human("Add a tag to one or more installed Skills", "为一个或多个已安装 Skill 添加标签"))
  .argument("<tag>", human("Tag to add", "要添加的标签"))
  .argument("<skills...>", human("Installed Skill names", "已安装 Skill 名称"))
  .option("--dry-run", human("Preview tag changes without changing state", "预览标签变更，不改写状态"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((tag, skills, options) => {
    const result = withApp(
      (app) => options.dryRun ? app.previewAddTag(tag, skills) : app.addTag(tag, skills),
      options.dryRun ? { recover: false, readOnly: true } : undefined
    );
    if (options.json) printJson({ ...(options.dryRun ? { dryRun: true } : {}), ...batchTagPayload(result) });
    else printBatchTagResult(result, Boolean(options.dryRun));
  }));

program.command("export")
  .description(human("Export a shareable static Skill catalog", "导出可分享的静态 Skill 目录"))
  .argument("[output]", human("Output HTML path", "输出 HTML 路径"), "skill-port-catalog.html")
  .option("--force", human("Replace an existing output file", "替换已有输出文件"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((output, options) => {
    const result = withApp((app) => app.exportCatalog(output, {
      force: Boolean(options.force),
      language: isChineseOutput() ? "zh-CN" : "en"
    }), { recover: false, readOnly: true });
    if (options.json) printJson(result);
    else console.log(human(
      `Exported static catalog\nOutput: ${result.output}\nSkills: ${result.skillCount}`,
      `已导出静态目录\n输出: ${result.output}\nSkill 数量: ${result.skillCount}`
    ));
  }));

program.command("info")
  .description(human("Show one installed Skill", "显示单个 Skill 信息"))
  .argument("<skill>")
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill) => withApp((app) => {
    const value = app.info(skill);
    printJson(value);
  })));

for (const commandName of ["enable", "disable"] as const) {
  program.command(commandName)
    .description(commandName === "enable"
      ? human("Enable a Skill for a project or the shared global Agent directory", "为项目或共享全局 Agent 目录启用 Skill")
      : human("Disable a Skill for a project or the shared global Agent directory", "停用项目或共享全局 Agent 目录中的 Skill"))
    .argument("<skill>")
    .option("--project <path>", human("Use an explicit initialized project", "使用指定的已初始化项目"))
    .option("--global", human("Use ~/.agents/skills as the global target", "使用 ~/.agents/skills 作为全局目标"))
    .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
    .action(run((skill, options) => withApp((app) => {
      if (options.project && options.global) throw new CliError("--project and --global cannot be combined.");
      if (commandName === "enable") {
        const record = app.enable(skill, options);
        if (options.json) printJson({ enablement: record });
        else console.log(human(
          `Enabled ${skill}\nTarget: ${record.targetKey}\nEntry: ${record.entryPath}`,
          `已启用 ${skill}\n目标: ${record.targetKey}\n入口: ${record.entryPath}`
        ));
      } else {
        app.disable(skill, options);
        if (options.json) printJson({ disabled: skill });
        else console.log(human(`Disabled ${skill}`, `已停用 ${skill}`));
      }
    })));
}

program.command("doctor")
  .description(human(
    "Diagnose Hub, catalog, and enablement drift without changing state",
    "只读诊断 Hub、catalog 和启用状态漂移"
  ))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action((options) => {
    let app: SkillPort;
    try {
      app = SkillPort.open({ recover: false, readOnly: true });
    } catch (error) {
      const code = error instanceof CliError ? "HUB_UNAVAILABLE" : "DATABASE_UNREADABLE";
      const diagnostics = [{
        code,
        severity: "error" as const,
        message: sanitizeError(error),
        suggestion: "Run `sklp init` first, then rerun `sklp doctor`."
      }, ...diagnoseAgentIntegration()];
      if (options.json) {
        printJson({
          healthy: false,
          diagnostics
        });
      } else {
        for (const diagnostic of diagnostics) printDiagnostic(diagnostic);
      }
      process.exitCode = 1;
      return;
    }
    try {
      const diagnostics = [...app.doctor(), ...diagnoseAgentIntegration()];
      if (options.json) {
        printJson({ healthy: diagnostics.length === 0, diagnostics });
      } else if (diagnostics.length === 0) {
        console.log(human("Skill Port is healthy.", "Skill Port 状态正常。"));
      } else {
        for (const diagnostic of diagnostics) printDiagnostic(diagnostic);
      }
      process.exitCode = diagnostics.some((item) => item.severity === "error") ? 1 : 0;
    } finally {
      app.close();
    }
  });

program.parseAsync().catch(handleError);

function withApp<T>(fn: (app: SkillPort) => T, options?: { recover?: boolean; readOnly?: boolean }): T {
  const app = SkillPort.open(options);
  try {
    return fn(app);
  } finally {
    app.close();
  }
}

function run<T extends unknown[]>(fn: (...args: T) => unknown) {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error, args.some((value) => isJsonOption(value)));
    }
  };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function human(english: string, chinese: string): string {
  return isChineseOutput() ? chinese : english;
}

function isChineseOutput(): boolean {
  return /^zh\b|^zh[-_]/i.test(process.env.SKLP_LANG ?? "");
}

function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return typeof manifest.version === "string" ? manifest.version : "0.0.0";
}

function confirmUninstall(): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      readline.close();
      resolve(confirmed);
    };
    readline.once("close", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
    readline.question(human(
      "Confirm uninstall sklp and delete its managed Skills? [y/N] ",
      "确认卸载 sklp 并删除其管理的技能？ [y/N] "
    ), (answer) => finish(answer === "y"));
  });
}

function uninstallGlobalPackage(): string | null {
  const npmCli = npmCliPath();
  if (!npmCli) return human(
    "Could not locate npm. Remove skill-port-cli with `npm uninstall --global skill-port-cli`.",
    "找不到 npm。请执行 `npm uninstall --global skill-port-cli`。"
  );
  const result = spawnSync(process.execPath, [npmCli, "uninstall", "--global", "skill-port-cli"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status === 0) return null;
  return human(
    `Could not uninstall skill-port-cli with npm: ${sanitizeError(result.stderr || result.error)}`,
    `无法通过 npm 卸载 skill-port-cli：${sanitizeError(result.stderr || result.error)}`
  );
}

function npmCliPath(): string | null {
  const configured = process.env.npm_execpath;
  if (configured && existsSync(configured)) return configured;
  const nodeDirectory = dirname(process.execPath);
  const candidates = [
    join(nodeDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function publicSkill(skill: Skill) {
  return {
    instanceId: skill.instanceId,
    name: skill.name,
    description: skill.description,
    tags: skill.tags
  };
}

function batchTagPayload(result: { tag: string; skills: Skill[] }) {
  return { tag: result.tag, skills: result.skills.map(publicSkill) };
}

function printBatchTagResult(result: { tag: string; skills: Skill[] }, dryRun: boolean): void {
  for (const skill of result.skills) {
    console.log(human(
      `${dryRun ? "Would tag" : "Tagged"} ${skill.name} with ${result.tag}`,
      `${dryRun ? "将为" : "已为"} ${skill.name} ${dryRun ? "添加" : "添加了"}标签 ${result.tag}`
    ));
  }
}

function installPayload(value: { skills: unknown[]; skipped?: unknown[]; failed?: unknown[]; dryRun?: boolean }) {
  return {
    ...(value.dryRun ? { dryRun: true } : {}),
    skills: value.skills,
    ...(value.skipped && value.skipped.length > 0 ? { skipped: value.skipped } : {}),
    ...(value.failed && value.failed.length > 0 ? { failed: value.failed } : {})
  };
}

function printInstallPreview(result: {
  skills: Array<{ name: string; description: string }>;
  skipped: Array<{ name: string }>;
  failed: Array<{ name?: string; reason: string }>;
}): void {
  for (const skill of result.skills) {
    console.log(human(`Would install ${skill.name}\t${skill.description}`, `将安装 ${skill.name}\t${skill.description}`));
  }
  for (const skipped of result.skipped) {
    console.log(human(`Would skip existing ${skipped.name}`, `将跳过已安装 ${skipped.name}`));
  }
  for (const failed of result.failed) {
    console.log(human(
      `Would fail ${failed.name ?? "source"}\t${failed.reason}`,
      `将失败 ${failed.name ?? "来源"}\t${failed.reason}`
    ));
  }
}

function printInstallResult(result: { skills: Skill[]; skipped: Array<{ name: string }> }): void {
  for (const skipped of result.skipped) {
    console.log(human(`Skipped existing ${skipped.name}`, `已跳过已安装 ${skipped.name}`));
  }
  for (const skill of result.skills) {
    console.log(human(`Installed ${skill.name}\nInstance: ${skill.instanceId}`, `已安装 ${skill.name}\n实例: ${skill.instanceId}`));
  }
}

function printPrunePreview(preview: PrunePreview): void {
  if (preview.planned.length === 0 && preview.skipped.length === 0) {
    console.log(human("No unused copied Skills to prune.", "没有可清理的未启用 Skill 副本。"));
    return;
  }
  console.log(human("Prune preview", "清理预览"));
  for (const item of preview.planned) console.log(human(`Would remove ${item.name}`, `将移除 ${item.name}`));
  for (const item of preview.skipped) {
    console.log(human(
      `Would skip ${item.name}: ${pruneReason(item.reason, false)}`,
      `将跳过 ${item.name}：${pruneReason(item.reason, true)}`
    ));
  }
}

function printPruneResult(result: PruneResult): void {
  if (result.removed.length === 0 && result.skipped.length === 0 && result.failed.length === 0) {
    console.log(human("No unused copied Skills to prune.", "没有可清理的未启用 Skill 副本。"));
    return;
  }
  console.log(human("Prune summary", "清理汇总"));
  for (const item of result.removed) console.log(human(`Removed ${item.name}`, `已移除 ${item.name}`));
  for (const item of result.skipped) {
    console.log(human(
      `Skipped ${item.name}: ${pruneReason(item.reason, false)}`,
      `已跳过 ${item.name}：${pruneReason(item.reason, true)}`
    ));
  }
  for (const item of result.failed) console.log(human(`Failed ${item.name}: ${item.reason}`, `失败 ${item.name}：${item.reason}`));
}

function pruneReason(reason: PruneSkipReason, chinese: boolean): string {
  if (reason === "linked") return chinese ? "linked Skill 保留外部源" : "linked Skill preserves its external source";
  return chinese ? "无法验证受管副本所有权" : "managed copy ownership could not be verified";
}

function skillStatusPayload(status: SkillStatus) {
  return {
    ...publicSkill(status.skill),
    installationKind: status.installationKind,
    enablementCount: status.enablementCount,
    health: status.health
  };
}

function printSkillStatuses(statuses: SkillStatus[]): void {
  console.log(human(
    "NAME\tKIND\tENABLED\tHEALTH\tDESCRIPTION\tTAGS",
    "名称\t类型\t启用数\t健康状态\t描述\t标签"
  ));
  for (const status of statuses) {
    console.log([
      status.skill.name,
      installationKindLabel(status.installationKind),
      status.enablementCount,
      healthLabel(status.health),
      status.skill.description,
      status.skill.tags.join(", ")
    ].join("\t"));
  }
}

function installationKindLabel(kind: SkillInstallationKind): string {
  if (!isChineseOutput()) return kind;
  if (kind === "git-copy") return "Git 副本";
  if (kind === "local-copy") return "本地副本";
  return "链接";
}

function healthLabel(health: SkillStatusHealth): string {
  if (!isChineseOutput()) return health;
  if (health === "healthy") return "正常";
  if (health === "missing") return "缺失";
  if (health === "conflict") return "冲突";
  return "未启用";
}

function printUpdateCheck(update: FleetUpdateCheck): void {
  const lines = [
    human(`Update check for ${update.name}: ${update.status}`, `更新检查 ${update.name}: ${update.status}`),
    human(`Tracking: ${update.sourceTracking}`, `跟踪类型: ${update.sourceTracking}`),
    human(`Current revision: ${update.currentRevision ?? "unknown"}`, `当前 revision: ${update.currentRevision ?? "未知"}`)
  ];
  if (update.remoteRevision) lines.push(human(`Remote revision: ${update.remoteRevision}`, `远程 revision: ${update.remoteRevision}`));
  if (update.reason) lines.push(human(`Reason: ${update.reason}`, `原因: ${update.reason}`));
  console.log(lines.join("\n"));
}

function printUpdateSummary(summary: UpdateSummary): void {
  console.log(human("Update preview", "更新预览"));
  for (const item of summary.planned) console.log(human(`Update ${item.name} to ${item.revision}`, `更新 ${item.name} 至 ${item.revision}`));
  printSkippedAndFailed(summary);
}

function printBatchUpdateSummary(summary: BatchUpdateSummary): void {
  console.log(human("Batch update summary", "批量更新汇总"));
  for (const item of summary.updated) console.log(human(`Updated ${item.name} to ${item.revision}`, `已更新 ${item.name} 至 ${item.revision}`));
  printSkippedAndFailed(summary);
}

function printSyncSummary(summary: SyncSummary, dryRun: boolean): void {
  if (summary.sources.length === 0 && summary.failed.length === 0) {
    console.log(human("No registered Git source collections.", "没有已登记的 Git 来源集合。"));
    return;
  }
  console.log(human(dryRun ? "Sync preview" : "Sync summary", dryRun ? "同步预览" : "同步汇总"));
  for (const item of summary.sources) {
    console.log(human(
      `Source ${item.source.location} (${item.source.path})`,
      `来源 ${item.source.location}（${item.source.path}）`
    ));
    for (const change of item.added) console.log(human(`${dryRun ? "Would add" : "Added"} ${change.name}`, `${dryRun ? "将新增" : "已新增"} ${change.name}`));
    for (const change of item.updated) console.log(human(`${dryRun ? "Would update" : "Updated"} ${change.name}`, `${dryRun ? "将更新" : "已更新"} ${change.name}`));
    for (const change of item.unchanged) console.log(human(`Unchanged ${change.name}`, `未变化 ${change.name}`));
    for (const missing of item.missing) {
      console.log(human(
        `Missing ${missing.name}: ${syncMissingAction(missing.action, false)}`,
        `缺失 ${missing.name}：${syncMissingAction(missing.action, true)}`
      ));
    }
    for (const removed of item.removed) console.log(human(`Removed ${removed.name}`, `已移除 ${removed.name}`));
    for (const failure of item.failed) {
      console.log(human(
        `Failed ${failure.name ?? failure.path ?? "source"}: ${failure.reason}`,
        `失败 ${failure.name ?? failure.path ?? "来源"}：${failure.reason}`
      ));
    }
  }
  for (const failure of summary.failed) {
    console.log(human(`Failed source ${failure.source}: ${failure.reason}`, `来源失败 ${failure.source}：${failure.reason}`));
  }
}

function syncMissingAction(action: "retain" | "remove" | "skip-enabled", chinese: boolean): string {
  if (action === "remove") return chinese ? "将移除" : "remove";
  if (action === "skip-enabled") return chinese ? "已启用，跳过移除" : "skip removal because it is enabled";
  return chinese ? "保留本地副本" : "retain local copy";
}

function syncHasFailures(summary: SyncSummary): boolean {
  return summary.failed.length > 0 || summary.sources.some((source) => source.failed.length > 0);
}

function printSkippedAndFailed(summary: Pick<UpdateSummary, "skipped" | "failed">): void {
  for (const item of summary.skipped) console.log(human(`Skipped ${item.name}: ${item.reason}`, `已跳过 ${item.name}: ${item.reason}`));
  for (const item of summary.failed) console.log(human(`Failed ${item.name}: ${item.reason}`, `失败 ${item.name}: ${item.reason}`));
}

function validateUpdateTarget(skill: string | undefined, options: { all?: boolean }): void {
  if (Boolean(skill) === Boolean(options.all)) {
    throw new CliError(human("Specify exactly one Skill name or --all.", "请仅指定一个 Skill 名称或 --all。"));
  }
}

function validateSyncTarget(source: string | undefined, options: { all?: boolean }): void {
  if (Boolean(source) === Boolean(options.all)) {
    throw new CliError(human("Specify exactly one Git source or --all.", "请仅指定一个 Git 来源或 --all。"));
  }
}

function handleError(error: unknown, json = false): void {
  const message = sanitizeError(error);
  if (json) printJson({ error: { code: error instanceof CliError ? "COMMAND_FAILED" : "INTERNAL_ERROR", message } });
  else console.error(isChineseOutput() ? `错误: ${message}` : message);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
}

function isJsonOption(value: unknown): value is { json: boolean } {
  return value !== null && typeof value === "object" && "json" in value && value.json === true;
}

function printDiagnostic(diagnostic: { code: string; severity: string; message: string; suggestion: string }): void {
  console.error(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
  console.error(human(`Suggestion: ${diagnostic.suggestion}`, `建议: ${diagnostic.suggestion}`));
}
