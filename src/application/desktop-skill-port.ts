import { existsSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { CliError, sanitizeError } from "../domain/errors.js";
import type { Diagnostic, Enablement, EnablementInfo, Skill } from "../domain/models.js";
import { resolveHub } from "../infrastructure/config.js";
import { SkillPort } from "./skill-port.js";

export type DesktopInstallationKind = "git-copy" | "local-copy" | "linked";
export type DesktopHealth = "healthy" | "missing" | "conflict" | "not-enabled";

export type DesktopSkillSummary = {
  instanceId: string;
  name: string;
  description: string;
  tags: string[];
  installationKind: DesktopInstallationKind;
  sourceTracking: Skill["sourceTracking"];
  enablementCount: number;
  health: DesktopHealth;
};

export type DesktopSkillDetails = DesktopSkillSummary & {
  sourceLocation: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  installedAt: string;
  updatedAt: string;
  enablements: EnablementInfo[];
};

export type DesktopBootstrapState = {
  initialized: boolean;
  hubPath: string;
  skillCount: number;
  projectCount: number;
  recovery: "checked" | "not-initialized";
};

export type DesktopInstallOptions = {
  ref?: string;
  gitPath?: string;
  skipExisting?: boolean;
};

export type DesktopTarget =
  | { type: "global" }
  | { type: "project"; path?: string };

export type DesktopError = {
  code: "COMMAND_FAILED" | "INTERNAL_ERROR";
  message: string;
};

export class DesktopSkillPort {
  getBootstrapState(): DesktopBootstrapState {
    const paths = resolveHub();
    if (!existsSync(paths.config) || !existsSync(paths.database)) {
      return {
        initialized: false,
        hubPath: paths.root,
        skillCount: 0,
        projectCount: 0,
        recovery: "not-initialized"
      };
    }
    const app = SkillPort.open();
    try {
      return {
        initialized: true,
        hubPath: app.paths.root,
        skillCount: app.list().length,
        projectCount: app.projects().length,
        recovery: "checked"
      };
    } finally {
      app.close();
    }
  }

  initialize(input: { project: string; hub?: string }): DesktopBootstrapState {
    if (input.hub && process.env.SKLP_HOME && resolve(input.hub) !== resolve(process.env.SKLP_HOME)) {
      throw new CliError(`Cannot use custom Hub ${input.hub} while SKLP_HOME points to ${process.env.SKLP_HOME}. Clear the custom Hub field or restart without SKLP_HOME.`);
    }
    const app = SkillPort.init({ project: input.project, hub: input.hub });
    app.close();
    return this.getBootstrapState();
  }

  listSkills(tag?: string): DesktopSkillSummary[] {
    return this.read((app) => app.list(tag).map((skill) => this.summary(app, skill)));
  }

  getSkill(name: string): DesktopSkillDetails {
    return this.read((app) => {
      const value = app.info(name);
      return this.details(app, value.skill, value.enablements);
    });
  }

  listProjects(): string[] {
    return this.read((app) => app.projects());
  }

  registerProject(path: string): string {
    return this.write((app) => app.registerProject(path));
  }

  previewInstall(source: string, options: DesktopInstallOptions = {}) {
    return this.read((app) => app.previewInstall(source, options.ref, {
      gitPath: options.gitPath,
      skipExisting: options.skipExisting
    }));
  }

  install(source: string, options: DesktopInstallOptions = {}) {
    return this.write((app) => app.installAll(source, options.ref, {
      gitPath: options.gitPath,
      skipExisting: options.skipExisting
    })).skills.map((skill) => this.getSkill(skill.name));
  }

  previewLink(source: string) {
    return this.read((app) => app.previewLink(source));
  }

  link(source: string): DesktopSkillDetails {
    const skill = this.write((app) => app.link(source));
    return this.getSkill(skill.name);
  }

  enable(name: string, target: DesktopTarget): Enablement {
    return this.write((app) => app.enable(name, targetOptions(target)));
  }

  disable(name: string, target: DesktopTarget): void {
    this.write((app) => app.disable(name, targetOptions(target)));
  }

  doctor(): Diagnostic[] {
    return this.read((app) => app.doctor());
  }

  remove(name: string, force = false): void {
    this.write((app) => app.remove(name, force));
  }

  unlink(name: string, force = false): void {
    this.write((app) => app.unlink(name, force));
  }

  private read<T>(fn: (app: SkillPort) => T): T {
    const app = SkillPort.open({ recover: false, readOnly: true });
    try {
      return fn(app);
    } finally {
      app.close();
    }
  }

  private write<T>(fn: (app: SkillPort) => T): T {
    const app = SkillPort.open();
    try {
      return fn(app);
    } finally {
      app.close();
    }
  }

  private summary(app: SkillPort, skill: Skill): DesktopSkillSummary {
    const enablements = app.info(skill.name).enablements;
    return {
      instanceId: skill.instanceId,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      installationKind: installationKind(app, skill),
      sourceTracking: skill.sourceTracking,
      enablementCount: enablements.length,
      health: aggregateHealth(enablements)
    };
  }

  private details(app: SkillPort, skill: Skill, enablements: EnablementInfo[]): DesktopSkillDetails {
    return {
      ...this.summary(app, skill),
      sourceLocation: skill.sourceLocation,
      sourceRef: skill.sourceRef,
      sourceRevision: skill.sourceRevision,
      installedAt: skill.installedAt,
      updatedAt: skill.updatedAt,
      enablements
    };
  }
}

export function toDesktopError(error: unknown): DesktopError {
  return {
    code: error instanceof CliError ? "COMMAND_FAILED" : "INTERNAL_ERROR",
    message: sanitizeError(error)
  };
}

function targetOptions(target: DesktopTarget): { project?: string; global?: boolean } {
  return target.type === "global" ? { global: true } : { project: target.path };
}

function installationKind(app: SkillPort, skill: Skill): DesktopInstallationKind {
  try {
    if (lstatSync(join(app.paths.skills, skill.name)).isSymbolicLink()) return "linked";
  } catch {
    // A missing entry is represented by its recorded source type and surfaced by doctor.
  }
  return skill.sourceType === "git" ? "git-copy" : "local-copy";
}

function aggregateHealth(enablements: EnablementInfo[]): DesktopHealth {
  if (enablements.length === 0) return "not-enabled";
  if (enablements.some((item) => item.health === "conflict")) return "conflict";
  if (enablements.some((item) => item.health === "missing")) return "missing";
  return "healthy";
}
