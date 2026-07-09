#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { CliError, sanitizeError } from "./domain/errors.js";
import { SkillPort } from "./application/skill-port.js";
import type { Skill } from "./domain/models.js";

const program = new Command()
  .name("sklp")
  .description("Local Agent Skill hub and project binding CLI")
  .version(packageVersion())
  .showHelpAfterError();

program.command("init")
  .description("Initialize Skill Port and register the current project")
  .option("--hub <path>", "Use a custom Hub path")
  .option("--project <path>", "Register a project other than the current directory")
  .option("--json", "Write machine-readable JSON")
  .action(run((options) => {
    const app = SkillPort.init(options);
    if (options.json) printJson({ hub: app.paths.root });
    else console.log(human(`Initialized Skill Port\nHub: ${app.paths.root}`, `已初始化 Skill Port\nHub: ${app.paths.root}`));
    app.close();
  }));

program.command("install")
  .description("Install a Skill from a local directory or Git URL")
  .argument("<source>")
  .option("--ref <ref>", "Git branch, tag, or commit")
  .option("--json", "Write machine-readable JSON")
  .option("--dry-run", "Preview installable Skills without changing state")
  .option("--skip-existing", "Skip Skills that are already installed")
  .action(run((source, options) => withApp((app) => {
    if (options.dryRun) {
      const result = app.previewInstall(source, options.ref, { skipExisting: Boolean(options.skipExisting) });
      if (options.json) printJson(installPayload({ ...result, dryRun: true }));
      else printInstallPreview(result);
      return;
    }
    const result = app.installAll(source, options.ref, { skipExisting: Boolean(options.skipExisting) });
    if (options.json) printJson(installPayload({ skills: result.skills.map(publicSkill), skipped: result.skipped }));
    else printInstallResult(result);
  })));

program.command("link")
  .description("Link a local Skill directory into the Hub")
  .argument("<source>")
  .option("--json", "Write machine-readable JSON")
  .action(run((source, options) => withApp((app) => {
    const skill = app.link(source);
    if (options.json) printJson({ skill: publicSkill(skill) });
    else console.log(human(`Linked ${skill.name}\nInstance: ${skill.instanceId}`, `已链接 ${skill.name}\n实例: ${skill.instanceId}`));
  })));

program.command("update")
  .description("Update an installed Skill")
  .argument("<skill>")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    const updated = app.update(skill);
    if (options.json) printJson({ skill: publicSkill(updated) });
    else console.log(human(`Updated ${updated.name}`, `已更新 ${updated.name}`));
  })));

program.command("remove")
  .description("Remove an installed Skill")
  .argument("<skill>")
  .option("--force", "Disable managed targets before removal")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    app.remove(skill, Boolean(options.force));
    if (options.json) printJson({ removed: skill });
    else console.log(human(`Removed ${skill}`, `已移除 ${skill}`));
  })));

program.command("unlink")
  .description("Unlink a linked Skill")
  .argument("<skill>")
  .option("--force", "Disable managed targets before unlinking")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    app.unlink(skill, Boolean(options.force));
    if (options.json) printJson({ unlinked: skill });
    else console.log(human(`Unlinked ${skill}`, `已取消链接 ${skill}`));
  })));

program.command("list")
  .description("List installed Skills")
  .option("--json", "Write machine-readable JSON")
  .action(run((options) => withApp((app) => {
    const skills = app.list();
    if (options.json) printJson({ skills: skills.map(publicSkill) });
    else for (const skill of skills) console.log(`${skill.name}\t${skill.description}`);
  })));

program.command("info")
  .description("Show one installed Skill")
  .argument("<skill>")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill) => withApp((app) => {
    const value = app.info(skill);
    printJson(value);
  })));

for (const commandName of ["enable", "disable"] as const) {
  program.command(commandName)
    .description(`${commandName === "enable" ? "Enable" : "Disable"} a Skill for a project or global tool`)
    .argument("<skill>")
    .option("--project <path>", "Use an explicit initialized project")
    .option("--global <tool>", "Use one supported global tool")
    .option("--json", "Write machine-readable JSON")
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
  .description("Diagnose Hub, catalog, and enablement drift without changing state")
  .option("--json", "Write machine-readable JSON")
  .action((options) => {
    let app: SkillPort;
    try {
      app = SkillPort.open({ recover: false, readOnly: true });
    } catch (error) {
      const code = error instanceof CliError ? "HUB_UNAVAILABLE" : "DATABASE_UNREADABLE";
      if (options.json) {
        printJson({ healthy: false, diagnostics: [{ code, severity: "error", message: sanitizeError(error) }] });
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
        }
      }
      process.exitCode = diagnostics.some((item) => item.severity === "error") ? 1 : 0;
    } finally {
      app.close();
    }
  });

program.parseAsync().catch(handleError);

function withApp<T>(fn: (app: SkillPort) => T): T {
  const app = SkillPort.open();
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
      handleError(error);
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

function installPayload(value: { skills: unknown[]; skipped?: unknown[]; dryRun?: boolean }) {
  return {
    ...(value.dryRun ? { dryRun: true } : {}),
    skills: value.skills,
    ...(value.skipped && value.skipped.length > 0 ? { skipped: value.skipped } : {})
  };
}

function printInstallPreview(result: { skills: Array<{ name: string; description: string }>; skipped: Array<{ name: string }> }): void {
  for (const skill of result.skills) {
    console.log(human(`Would install ${skill.name}\t${skill.description}`, `将安装 ${skill.name}\t${skill.description}`));
  }
  for (const skipped of result.skipped) {
    console.log(human(`Would skip existing ${skipped.name}`, `将跳过已安装 ${skipped.name}`));
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

function handleError(error: unknown): void {
  const message = sanitizeError(error);
  console.error(isChineseOutput() ? `错误: ${message}` : message);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
}
