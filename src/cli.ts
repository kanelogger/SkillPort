#!/usr/bin/env node
import { Command } from "commander";
import { CliError, sanitizeError } from "./domain/errors.js";
import { SkillPort } from "./application/skill-port.js";
import type { Skill } from "./domain/models.js";

const program = new Command()
  .name("sklp")
  .description("Local Agent Skill hub and project binding CLI")
  .version("0.1.2")
  .showHelpAfterError();

program.command("init")
  .description("Initialize Skill Port and register the current project")
  .option("--hub <path>", "Use a custom Hub path")
  .option("--project <path>", "Register a project other than the current directory")
  .option("--json", "Write machine-readable JSON")
  .action(run((options) => {
    const app = SkillPort.init(options);
    if (options.json) printJson({ hub: app.paths.root });
    else console.log(`Initialized Skill Port\nHub: ${app.paths.root}`);
    app.close();
  }));

program.command("install")
  .description("Install a Skill from a local directory or Git URL")
  .argument("<source>")
  .option("--ref <ref>", "Git branch, tag, or commit")
  .option("--json", "Write machine-readable JSON")
  .action(run((source, options) => withApp((app) => {
    const skills = app.installAll(source, options.ref);
    if (options.json) printJson({ skills: skills.map(publicSkill) });
    else for (const skill of skills) console.log(`Installed ${skill.name}\nInstance: ${skill.instanceId}`);
  })));

program.command("link")
  .description("Link a local Skill directory into the Hub")
  .argument("<source>")
  .option("--json", "Write machine-readable JSON")
  .action(run((source, options) => withApp((app) => {
    const skill = app.link(source);
    if (options.json) printJson({ skill: publicSkill(skill) });
    else console.log(`Linked ${skill.name}\nInstance: ${skill.instanceId}`);
  })));

program.command("update")
  .description("Update an installed Skill")
  .argument("<skill>")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    const updated = app.update(skill);
    if (options.json) printJson({ skill: publicSkill(updated) });
    else console.log(`Updated ${updated.name}`);
  })));

program.command("remove")
  .description("Remove an installed Skill")
  .argument("<skill>")
  .option("--force", "Disable managed targets before removal")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    app.remove(skill, Boolean(options.force));
    if (options.json) printJson({ removed: skill });
    else console.log(`Removed ${skill}`);
  })));

program.command("unlink")
  .description("Unlink a linked Skill")
  .argument("<skill>")
  .option("--force", "Disable managed targets before unlinking")
  .option("--json", "Write machine-readable JSON")
  .action(run((skill, options) => withApp((app) => {
    app.unlink(skill, Boolean(options.force));
    if (options.json) printJson({ unlinked: skill });
    else console.log(`Unlinked ${skill}`);
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
        else console.log(`Enabled ${skill}\nTarget: ${record.targetKey}\nEntry: ${record.entryPath}`);
      } else {
        app.disable(skill, options);
        if (options.json) printJson({ disabled: skill });
        else console.log(`Disabled ${skill}`);
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
        console.log("Skill Port is healthy.");
      } else {
        for (const diagnostic of diagnostics) {
          console.error(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
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

function publicSkill(skill: Skill) {
  return {
    instanceId: skill.instanceId,
    name: skill.name,
    description: skill.description
  };
}

function handleError(error: unknown): void {
  console.error(sanitizeError(error));
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
}
