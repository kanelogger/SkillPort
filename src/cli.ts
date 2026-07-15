#!/usr/bin/env node
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { CliError, sanitizeError } from "./domain/errors.js";
import { SkillPort, type BatchUpdateSummary, type FleetUpdateCheck, type UpdateSummary } from "./application/skill-port.js";
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
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill, options) => {
    validateUpdateTarget(skill, options);
    if (options.check && options.dryRun) {
      throw new CliError(human("Choose either --check or --dry-run.", "请选择 --check 或 --dry-run 其中之一。"));
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
      const result = withApp((app) => app.updateAll());
      if (options.json) printJson(result);
      else printBatchUpdateSummary(result);
      if (result.failed.length > 0) process.exitCode = 1;
      return;
    }
    return withApp((app) => {
    const updated = app.update(skill);
    if (options.json) printJson({ skill: publicSkill(updated) });
    else console.log(human(`Updated ${updated.name}`, `已更新 ${updated.name}`));
    });
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
    const result = SkillPort.uninstall();
    const npmFailure = uninstallGlobalPackage();
    const failures = [...result.failures, ...(npmFailure ? [npmFailure] : [])];
    if (failures.length > 0) {
      throw new CliError(human(
        `Uninstall completed with errors:\n${failures.join("\n")}`,
        `卸载完成，但存在错误：\n${failures.join("\n")}`
      ));
    }
    console.log(human("Uninstalled sklp.", "已卸载 sklp。"));
  }));

program.command("list")
  .description(human("List installed Skills", "列出已安装 Skill"))
  .option("--tag <tag>", human("Filter Skills by Publisher tag", "按发布者标签筛选 Skill"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => withApp((app) => {
    const skills = app.list(options.tag);
    if (options.json) printJson({ skills: skills.map(publicSkill) });
    else for (const skill of skills) console.log(`${skill.name}\t${skill.description}${skill.tags.length ? `\t${skill.tags.join(", ")}` : ""}`);
  })));

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
      if (options.json) {
        printJson({
          healthy: false,
          diagnostics: [{
            code,
            severity: "error",
            message: sanitizeError(error),
            suggestion: "Run `sklp init` first, then rerun `sklp doctor`."
          }]
        });
      } else {
        console.error(`[error] ${code}: ${sanitizeError(error)}`);
      }
      process.exitCode = 1;
      return;
    }
    try {
      const diagnostics = app.doctor();
      if (options.json) {
        printJson({ healthy: diagnostics.length === 0, diagnostics });
      } else if (diagnostics.length === 0) {
        console.log(human("Skill Port is healthy.", "Skill Port 状态正常。"));
      } else {
        for (const diagnostic of diagnostics) {
          console.error(human(
            `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`,
            `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`
          ));
          console.error(human(`Suggestion: ${diagnostic.suggestion}`, `建议: ${diagnostic.suggestion}`));
        }
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

function printSkippedAndFailed(summary: Pick<UpdateSummary, "skipped" | "failed">): void {
  for (const item of summary.skipped) console.log(human(`Skipped ${item.name}: ${item.reason}`, `已跳过 ${item.name}: ${item.reason}`));
  for (const item of summary.failed) console.log(human(`Failed ${item.name}: ${item.reason}`, `失败 ${item.name}: ${item.reason}`));
}

function validateUpdateTarget(skill: string | undefined, options: { all?: boolean }): void {
  if (Boolean(skill) === Boolean(options.all)) {
    throw new CliError(human("Specify exactly one Skill name or --all.", "请仅指定一个 Skill 名称或 --all。"));
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
