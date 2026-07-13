#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { CliError, sanitizeError } from "./domain/errors.js";
import { SkillPort } from "./application/skill-port.js";
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
  .argument("<skill>")
  .option("--check", human("Check whether a Git Skill has a remote update", "检查 Git Skill 是否有远程更新"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((skill, options) => {
    if (options.check) {
      const update = withApp((app) => app.checkUpdate(skill), { recover: false, readOnly: true });
      if (options.json) printJson({ update });
      else printUpdateCheck(update);
      if (update.status === "unknown") process.exitCode = 1;
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

program.command("list")
  .description(human("List installed Skills", "列出已安装 Skill"))
  .option("--json", human("Write machine-readable JSON", "输出机器可读 JSON"))
  .action(run((options) => withApp((app) => {
    const skills = app.list();
    if (options.json) printJson({ skills: skills.map(publicSkill) });
    else for (const skill of skills) console.log(`${skill.name}\t${skill.description}`);
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
      ? human("Enable a Skill for a project or global tool", "为项目或全局工具启用 Skill")
      : human("Disable a Skill for a project or global tool", "停用项目或全局工具中的 Skill"))
    .argument("<skill>")
    .option("--project <path>", human("Use an explicit initialized project", "使用指定的已初始化项目"))
    .option("--global <tool>", human("Use one supported global tool", "使用指定的受支持全局工具"))
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

function publicSkill(skill: Skill) {
  return {
    instanceId: skill.instanceId,
    name: skill.name,
    description: skill.description
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

function printUpdateCheck(update: {
  name: string;
  status: string;
  sourceTracking: string;
  currentRevision: string | null;
  remoteRevision: string | null;
  reason?: string;
}): void {
  const lines = [
    human(`Update check for ${update.name}: ${update.status}`, `更新检查 ${update.name}: ${update.status}`),
    human(`Tracking: ${update.sourceTracking}`, `跟踪类型: ${update.sourceTracking}`),
    human(`Current revision: ${update.currentRevision ?? "unknown"}`, `当前 revision: ${update.currentRevision ?? "未知"}`)
  ];
  if (update.remoteRevision) lines.push(human(`Remote revision: ${update.remoteRevision}`, `远程 revision: ${update.remoteRevision}`));
  if (update.reason) lines.push(human(`Reason: ${update.reason}`, `原因: ${update.reason}`));
  console.log(lines.join("\n"));
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
