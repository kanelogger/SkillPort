import {
  existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { CliError, sanitizeError } from "../domain/errors.js";
import { isValidSkillName, readSkillMetadata } from "../domain/metadata.js";
import type { Diagnostic, Enablement, EnablementInfo, Skill } from "../domain/models.js";
import { initializeHub, resolveHub, type HubPaths } from "../infrastructure/config.js";
import { StateStore } from "../infrastructure/database.js";
import {
  createDirectoryLink, isInside, managedLinkState, removeOwnedLink, withHubLock
} from "../infrastructure/filesystem.js";
import {
  copySource, inspectGitSource, prepareInstallSources, prepareLocalSource, prepareSource,
  type GitUpdateInspection, type PreparedSource
} from "../infrastructure/sources.js";
import { globalTarget } from "../infrastructure/targets.js";
import { renderCatalogJson, renderCatalogMarkdown, writeCatalogs, writeMeta } from "../projections/catalog.js";

type RecoveryPayload =
  | { kind: "install"; skill: Skill; destination: string }
  | { kind: "link"; skill: Skill; destination: string }
  | { kind: "update"; skill: Skill; destination: string; backup: string }
  | { kind: "update"; skill: Skill; destination: string; linked: true }
  | { kind: "remove"; skill: Skill; destination: string; backup: string; enablements: Enablement[] }
  | { kind: "enable"; skill: Skill; enablement: Omit<Enablement, "id"> }
  | { kind: "disable"; skill: Skill; enablement: Enablement };

type InstallMetadata = { name: string; description: string };
type InstallSkipped = InstallMetadata & { reason: "already-installed" };
type InstallFailed = Partial<InstallMetadata> & { path: string; reason: string };
type InstallCandidate = { prepared: PreparedSource; metadata: InstallMetadata };
type InstallOptions = { skipExisting?: boolean; gitPath?: string };
type UpdateSkipReason = "linked" | "local-copied" | "pinned" | "up-to-date";

export type UpdateCheck = GitUpdateInspection & {
  name: string;
  currentRevision: string | null;
};

export type FleetUpdateCheck = UpdateCheck | {
  name: string;
  status: "skipped";
  sourceTracking: "linked" | "local";
  currentRevision: null;
  remoteRevision: null;
  reason: "linked" | "local-copied";
};

export type UpdateSummary = {
  planned: Array<{ name: string; revision: string }>;
  skipped: Array<{ name: string; reason: UpdateSkipReason }>;
  failed: Array<{ name: string; reason: string }>;
};

export type BatchUpdateSummary = Omit<UpdateSummary, "planned"> & {
  updated: Array<{ name: string; revision: string }>;
};

class RecoveryPendingError extends Error {
  constructor(kind: string, cause: unknown) {
    super(`${kind} failed and rollback is pending: ${sanitizeError(cause)}`);
    this.name = "RecoveryPendingError";
  }
}

export class SkillPort {
  readonly paths: HubPaths;
  readonly store: StateStore;

  private constructor(paths: HubPaths, options: { readOnly?: boolean } = {}) {
    this.paths = paths;
    this.store = new StateStore(paths, options);
  }

  static init(options: { hub?: string; project?: string } = {}): SkillPort {
    const paths = resolveHub(options.hub);
    initializeHub(paths, Boolean(options.hub));
    const app = new SkillPort(paths);
    app.mutate("init", () => {
      app.store.addProject(canonicalDirectory(options.project ?? process.cwd()));
      writeCatalogs(paths, app.store.skills());
    });
    return app;
  }

  static open(options: { recover?: boolean; readOnly?: boolean } = {}): SkillPort {
    const paths = resolveHub();
    if (!existsSync(paths.config) || !existsSync(paths.database)) {
      throw new CliError("Skill Port is not initialized. Run `sklp init` first.");
    }
    const app = new SkillPort(paths, { readOnly: options.readOnly });
    if (options.recover !== false && !options.readOnly) {
      withHubLock(paths, () => app.recoverInterruptedOperations());
    }
    return app;
  }

  close(): void {
    this.store.close();
  }

  install(source: string, ref?: string): Skill {
    return this.installPreparedSource(prepareSource(source, this.paths.staging, ref));
  }

  installAll(source: string, ref?: string, options: InstallOptions = {}): { skills: Skill[]; skipped: InstallSkipped[] } {
    const preparedSources = prepareInstallSources(source, this.paths.staging, { ref, gitPath: options.gitPath });
    try {
      const plan = this.installPlan(preparedSources, options);
      const publisher = plan.candidates.length >= 2 ? plan.candidates[0]?.prepared.publisher : null;
      return {
        skills: plan.candidates.map((candidate) => this.installPreparedSource(candidate.prepared, publisher ? [publisher] : [])),
        skipped: plan.skipped
      };
    } finally {
      for (const prepared of preparedSources) prepared.cleanup();
    }
  }

  previewInstall(source: string, ref?: string, options: InstallOptions = {}): {
    skills: InstallMetadata[];
    skipped: InstallSkipped[];
    failed: InstallFailed[];
  } {
    const preparedSources = prepareInstallSources(source, this.paths.staging, { ref, gitPath: options.gitPath });
    try {
      const plan = this.installPreviewPlan(preparedSources, options);
      return {
        skills: plan.candidates.map((candidate) => candidate.metadata),
        skipped: plan.skipped,
        failed: plan.failed
      };
    } finally {
      for (const prepared of preparedSources) prepared.cleanup();
    }
  }

  private installPreparedSource(prepared: PreparedSource, tags: string[] = []): Skill {
    return this.mutate("install", (checkpoint) => {
      const staged = join(this.paths.staging, `install-${randomUUID()}`);
      try {
        if (prepared.type === "local") {
          const hubRoot = realpathSync(this.paths.root);
          const sourceRoot = realpathSync(prepared.root);
          if (isInside(hubRoot, sourceRoot) || isInside(sourceRoot, hubRoot)) {
            throw new CliError("Skill source and Hub must not contain one another.");
          }
        }
        const metadata = readSkillMetadata(prepared.root);
        if (this.store.skill(metadata.name)) {
          throw new CliError(
            `Skill already installed: ${metadata.name}. Change the incoming Skill's SKILL.md name before installing it.`
          );
        }
        copySource(prepared.root, staged);
        const timestamp = new Date().toISOString();
        const skill: Skill = {
          instanceId: randomUUID(),
          ...metadata,
          sourceType: prepared.type,
          sourceLocation: prepared.location,
          sourceRef: prepared.ref,
          sourceRevision: prepared.revision,
          sourceTracking: prepared.sourceTracking,
          tags,
          installedAt: timestamp,
          updatedAt: timestamp
        };
        writeMeta(join(staged, "meta.json"), skill);
        const destination = this.skillPath(skill);
        if (pathExistsLexically(destination)) {
          throw new CliError(`Hub destination already exists and is not registered: ${destination}`);
        }
        checkpoint({ kind: "install", skill, destination });
        this.store.transaction(() => this.store.insertSkill(skill));
        let published = false;
        try {
          renameSync(staged, destination);
          published = true;
          writeCatalogs(this.paths, this.store.skills());
        } catch (error) {
          try {
            if (published) this.removeRecoveryOwnedSkill(destination, skill.instanceId);
            this.store.transaction(() => this.store.deleteSkill(skill.instanceId));
          } catch (rollbackError) {
            throw new RecoveryPendingError("Install", rollbackError);
          }
          this.writeCatalogsBestEffort();
          throw error;
        }
        return skill;
      } finally {
        prepared.cleanup();
        rmSync(staged, { recursive: true, force: true });
      }
    });
  }

  private installPlan(preparedSources: PreparedSource[], options: { skipExisting?: boolean }): {
    candidates: InstallCandidate[];
    skipped: InstallSkipped[];
  } {
    const seen = new Set<string>();
    const candidates: InstallCandidate[] = [];
    const skipped: InstallSkipped[] = [];
    for (const prepared of preparedSources) {
      const metadata = readSkillMetadata(prepared.root);
      const key = metadata.name.toLowerCase();
      if (seen.has(key)) {
        throw new CliError(`Duplicate Skill name in install set: ${metadata.name}. 请修改来源 Skill 的 SKILL.md name 后再安装。`);
      }
      seen.add(key);
      if (this.store.skill(metadata.name)) {
        if (options.skipExisting) {
          skipped.push({ ...metadata, reason: "already-installed" });
          continue;
        }
        throw new CliError(
          `Skill already installed: ${metadata.name}. Change the incoming Skill's SKILL.md name before installing it. 请修改来源 Skill 的 SKILL.md name 后再安装。`
        );
      }
      candidates.push({ prepared, metadata });
    }
    return { candidates, skipped };
  }

  private installPreviewPlan(preparedSources: PreparedSource[], options: { skipExisting?: boolean }): {
    candidates: InstallCandidate[];
    skipped: InstallSkipped[];
    failed: InstallFailed[];
  } {
    const seen = new Set<string>();
    const candidates: InstallCandidate[] = [];
    const skipped: InstallSkipped[] = [];
    const failed: InstallFailed[] = [];
    for (const prepared of preparedSources) {
      let metadata: InstallMetadata;
      try {
        metadata = readSkillMetadata(prepared.root);
      } catch (error) {
        failed.push({ path: prepared.root, reason: sanitizeError(error) });
        continue;
      }
      const key = metadata.name.toLowerCase();
      if (seen.has(key)) {
        failed.push({ ...metadata, path: prepared.root, reason: `Duplicate Skill name in install set: ${metadata.name}` });
        continue;
      }
      seen.add(key);
      if (this.store.skill(metadata.name)) {
        if (options.skipExisting) skipped.push({ ...metadata, reason: "already-installed" });
        else failed.push({ ...metadata, path: prepared.root, reason: `Skill already installed: ${metadata.name}` });
        continue;
      }
      candidates.push({ prepared, metadata });
    }
    return { candidates, skipped, failed };
  }

  link(source: string): Skill {
    return this.mutate("link", (checkpoint) => {
      const prepared = prepareLocalSource(source);
      const sourceRoot = realpathSync(prepared.root);
      const hubRoot = realpathSync(this.paths.root);
      if (isInside(hubRoot, sourceRoot) || isInside(sourceRoot, hubRoot)) {
        throw new CliError("Skill source and Hub must not contain one another.");
      }
      const metadata = readSkillMetadata(sourceRoot);
      if (this.store.skill(metadata.name)) {
        throw new CliError(
          `Skill already installed: ${metadata.name}. Change the incoming Skill's SKILL.md name before linking it.`
        );
      }
      const timestamp = new Date().toISOString();
      const skill: Skill = {
        instanceId: randomUUID(),
        ...metadata,
        sourceType: "local",
        sourceLocation: sourceRoot,
        sourceRef: null,
        sourceRevision: null,
        sourceTracking: null,
        tags: [],
        installedAt: timestamp,
        updatedAt: timestamp
      };
      const destination = this.skillPath(skill);
      if (pathExistsLexically(destination)) {
        throw new CliError(`Hub destination already exists and is not registered: ${destination}`);
      }
      checkpoint({ kind: "link", skill, destination });
      let linked = false;
      try {
        createDirectoryLink(sourceRoot, destination);
        linked = true;
        this.verifySkillEntry(destination, sourceRoot);
        this.store.transaction(() => this.store.insertSkill(skill));
        writeCatalogs(this.paths, this.store.skills());
        return skill;
      } catch (error) {
        try {
          if (linked && managedLinkState(destination, sourceRoot) === "correct") removeOwnedLink(destination, sourceRoot);
          if (this.store.skill(skill.name)?.instanceId === skill.instanceId) {
            this.store.transaction(() => this.store.deleteSkill(skill.instanceId));
          }
        } catch (rollbackError) {
          throw new RecoveryPendingError("Link", rollbackError);
        }
        this.writeCatalogsBestEffort();
        throw error;
      }
    });
  }

  update(name: string, revision?: string): Skill {
    return this.mutate("update", (checkpoint) => {
      const current = this.requireSkill(name);
      const staged = join(this.paths.staging, `update-${randomUUID()}`);
      const backup = join(this.paths.staging, `backup-${randomUUID()}`);
      const destination = this.skillPath(current);
      if (this.isLinkedSkill(current)) {
        checkpoint({ kind: "update", skill: current, destination, linked: true });
        return this.updateLinkedSkill(current);
      }
      checkpoint({ kind: "update", skill: current, destination, backup });
      const prepared = prepareSource(current.sourceLocation, this.paths.staging, revision ?? current.sourceRef ?? undefined);
      try {
        const metadata = readSkillMetadata(prepared.root);
        if (metadata.name !== current.name) throw new CliError("Updated Skill name changed; remove and reinstall it.");
        copySource(prepared.root, staged);
        const updated: Skill = {
          ...current,
          description: metadata.description,
          sourceRevision: prepared.revision ?? current.sourceRevision,
          updatedAt: new Date().toISOString()
        };
        writeMeta(join(staged, "meta.json"), updated);
        renameSync(destination, backup);
        try {
          renameSync(staged, destination);
          this.store.transaction(() => this.store.updateSkill(updated));
          writeCatalogs(this.paths, this.store.skills());
          this.assertEnablementsHealthy(updated);
          rmSync(backup, { recursive: true, force: true });
          return updated;
        } catch (error) {
          try {
            if (pathExistsLexically(destination)) {
              this.removeRecoveryOwnedSkill(destination, current.instanceId);
            }
            renameSync(backup, destination);
            this.store.transaction(() => this.store.updateSkill(current));
          } catch (rollbackError) {
            throw new RecoveryPendingError("Update", rollbackError);
          }
          this.writeCatalogsBestEffort();
          throw error;
        }
      } finally {
        prepared.cleanup();
        rmSync(staged, { recursive: true, force: true });
      }
    });
  }

  checkUpdate(name: string): UpdateCheck {
    const skill = this.requireSkill(name);
    if (skill.sourceType !== "git") throw new CliError("Update checks are only available for Git-installed Skills.");
    return this.checkGitUpdate(skill);
  }

  checkAllUpdates(): FleetUpdateCheck[] {
    return this.store.skills().map((skill) => this.checkFleetUpdate(skill));
  }

  previewUpdate(name: string): UpdateSummary {
    return this.planUpdates([this.requireSkill(name)]);
  }

  previewAllUpdates(): UpdateSummary {
    return this.planUpdates(this.store.skills());
  }

  updateAll(): BatchUpdateSummary {
    const plan = this.previewAllUpdates();
    const updated: BatchUpdateSummary["updated"] = [];
    const failed = [...plan.failed];
    for (const item of plan.planned) {
      try {
        const skill = this.update(item.name, item.revision);
        updated.push({ name: skill.name, revision: skill.sourceRevision ?? item.revision });
      } catch (error) {
        failed.push({ name: item.name, reason: sanitizeError(error) });
      }
    }
    return {
      updated: updated.sort(byName),
      skipped: plan.skipped.sort(byName),
      failed: failed.sort(byName)
    };
  }

  private checkGitUpdate(skill: Skill): UpdateCheck {
    const inspection = inspectGitSource(skill.sourceLocation, skill.sourceRef, skill.sourceRevision, skill.sourceTracking);
    return { name: skill.name, currentRevision: skill.sourceRevision, ...inspection };
  }

  private checkFleetUpdate(skill: Skill): FleetUpdateCheck {
    if (this.isLinkedSkill(skill)) {
      return {
        name: skill.name,
        status: "skipped",
        sourceTracking: "linked",
        currentRevision: null,
        remoteRevision: null,
        reason: "linked"
      };
    }
    if (skill.sourceType !== "git") {
      return {
        name: skill.name,
        status: "skipped",
        sourceTracking: "local",
        currentRevision: null,
        remoteRevision: null,
        reason: "local-copied"
      };
    }
    return this.checkGitUpdate(skill);
  }

  private planUpdates(skills: Skill[]): UpdateSummary {
    const planned: UpdateSummary["planned"] = [];
    const skipped: UpdateSummary["skipped"] = [];
    const failed: UpdateSummary["failed"] = [];
    for (const check of skills.map((skill) => this.checkFleetUpdate(skill))) {
      if (check.status === "skipped") {
        skipped.push({ name: check.name, reason: check.reason });
      } else if (check.status === "outdated") {
        if (check.remoteRevision) planned.push({ name: check.name, revision: check.remoteRevision });
        else failed.push({ name: check.name, reason: "Git update check returned no remote revision." });
      } else if (check.status === "unknown") {
        failed.push({ name: check.name, reason: check.reason ?? "Git update check failed." });
      } else if (check.status === "up-to-date" || check.status === "pinned") {
        skipped.push({ name: check.name, reason: check.status });
      }
    }
    return { planned, skipped, failed };
  }

  remove(name: string, force = false): void {
    this.mutate("remove", (checkpoint) => {
      const skill = this.requireSkill(name);
      const active = this.store.enablements(skill.instanceId);
      const disabled: Enablement[] = [];
      const destination = this.skillPath(skill);
      const backup = join(this.paths.staging, `remove-${randomUUID()}`);
      if (active.length > 0 && !force) {
        throw new CliError(`Skill is enabled at: ${active.map((item) => item.targetKey).join(", ")}`);
      }
      checkpoint({ kind: "remove", skill, destination, backup, enablements: active });
      try {
        if (force) {
          for (const enablement of active) {
            if (managedLinkState(enablement.entryPath, destination) === "conflict") {
              throw new CliError(`Refusing forced removal because an entry is unmanaged: ${enablement.entryPath}`);
            }
          }
          for (const enablement of active) {
            this.disableEnablement(skill, enablement);
            disabled.push(enablement);
          }
        }
        renameSync(destination, backup);
        this.store.transaction(() => this.store.deleteSkill(skill.instanceId));
        writeCatalogs(this.paths, this.store.skills());
        rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        try {
          if (!existsSync(destination) && existsSync(backup)) renameSync(backup, destination);
          if (!this.store.skill(skill.name)) this.store.transaction(() => this.store.insertSkill(skill));
          for (const enablement of disabled) {
            if (managedLinkState(enablement.entryPath, destination) === "absent") {
              const linkType = createDirectoryLink(destination, enablement.entryPath);
              this.store.transaction(() => this.store.insertEnablement({ ...enablement, linkType }));
            }
          }
        } catch (rollbackError) {
          throw new RecoveryPendingError("Remove", rollbackError);
        }
        this.writeCatalogsBestEffort();
        throw error;
      }
    });
  }

  unlink(name: string, force = false): void {
    const skill = this.requireSkill(name);
    if (!this.isLinkedSkill(skill)) throw new CliError(`Skill is not linked: ${name}`);
    this.remove(name, force);
  }

  enable(name: string, options: { project?: string; global?: boolean }): Enablement {
    return this.mutate("enable", (checkpoint) => {
      const skill = this.requireSkill(name);
      const target = options.global
        ? this.resolveGlobal()
        : this.resolveProject(options.project);
      const entryPath = join(target.path, skill.name);
      const expected = this.skillPath(skill);
      const existing = this.store.enablements(skill.instanceId)
        .find((item) => item.targetType === target.type && item.targetKey === target.key);
      if (existing && !samePath(existing.entryPath, entryPath)) {
        throw new CliError(`Recorded enablement path conflicts with the selected target: ${existing.entryPath}`);
      }
      const enablement = {
        skillId: skill.instanceId,
        targetType: target.type,
        targetKey: target.key,
        targetPath: target.path,
        entryPath,
        linkType: "symlink"
      };
      checkpoint({ kind: "enable", skill, enablement });
      const state = managedLinkState(entryPath, expected);
      if (state === "conflict") throw new CliError(`Target entry is not managed by Skill Port: ${entryPath}`);
      if (state === "correct" && !existing) {
        throw new CliError(`Target entry points to the Hub but is not registered: ${entryPath}. Run \`sklp doctor\`.`);
      }
      let created = false;
      let linkType = "symlink";
      if (state === "absent") {
        linkType = createDirectoryLink(expected, entryPath);
        created = true;
      } else {
        linkType = existing?.linkType ?? "symlink";
      }
      try {
        this.verifySkillEntry(entryPath, expected);
        this.store.transaction(() => {
          if (existing) this.store.updateEnablementLinkType(existing.id, linkType);
          else this.store.insertEnablement({ ...enablement, linkType });
        });
      } catch (error) {
        if (created && managedLinkState(entryPath, expected) === "correct") {
          try {
            removeOwnedLink(entryPath, expected);
          } catch (rollbackError) {
            throw new RecoveryPendingError("Enable", rollbackError);
          }
        }
        throw error;
      }
      const record = this.store.enablementByEntry(entryPath);
      if (!record) throw new CliError("Enablement could not be recorded.");
      return record;
    });
  }

  disable(name: string, options: { project?: string; global?: boolean }): void {
    this.mutate("disable", (checkpoint) => {
      const skill = this.requireSkill(name);
      const target = options.global
        ? this.resolveGlobal()
        : this.resolveProject(options.project);
      const record = this.store.enablements(skill.instanceId)
        .find((item) => item.targetType === target.type && item.targetKey === target.key);
      if (!record) return;
      checkpoint({ kind: "disable", skill, enablement: record });
      try {
        this.disableEnablement(skill, record);
      } catch (error) {
        if (this.store.enablementByEntry(record.entryPath)
          && managedLinkState(record.entryPath, this.skillPath(skill)) === "absent") {
          throw new RecoveryPendingError("Disable", error);
        }
        throw error;
      }
    });
  }

  list(tag?: string): Skill[] {
    return tag ? this.store.skillsWithTag(tag) : this.store.skills();
  }

  info(name: string): { skill: Skill; enablements: EnablementInfo[] } {
    const skill = this.requireSkill(name);
    const expected = this.skillPath(skill);
    const enablements = this.store.enablements(skill.instanceId).map((enablement) => ({
      ...enablement,
      health: enablementHealth(enablement.entryPath, expected)
    }));
    return { skill, enablements };
  }

  doctor(): Diagnostic[] {
    const diagnostics: Array<Omit<Diagnostic, "suggestion">> = [];
    const skills = this.store.skills();
    const skillsDirectoryAvailable = existsSync(this.paths.skills) && lstatSync(this.paths.skills).isDirectory();
    if (!skillsDirectoryAvailable) {
      diagnostics.push({
        code: "HUB_SKILLS_UNAVAILABLE",
        severity: "error",
        message: "Hub skills directory is missing or is not a directory"
      });
    }
    for (const skill of skills) {
      const root = this.skillPath(skill);
      if (!existsSync(join(root, "SKILL.md"))) {
        diagnostics.push({ code: "SKILL_CONTENT_MISSING", severity: "error", message: `${skill.name}: SKILL.md missing` });
      } else {
        try {
          const metadata = readSkillMetadata(root);
          if (metadata.name !== skill.name || metadata.description !== skill.description) {
            diagnostics.push({
              code: "SKILL_METADATA_DRIFT",
              severity: "error",
              message: `${skill.name}: SKILL.md metadata disagrees with SQLite`
            });
          }
        } catch (error) {
          diagnostics.push({
            code: "SKILL_METADATA_INVALID",
            severity: "error",
            message: `${skill.name}: ${sanitizeError(error)}`
          });
        }
      }
      const metaPath = join(root, "meta.json");
      if (this.isLinkedSkill(skill)) {
        if (skill.sourceType !== "local") {
          diagnostics.push({ code: "LINK_SOURCE_DRIFT", severity: "error", message: `${skill.name}: linked Skill has invalid source type` });
        }
      } else if (!existsSync(metaPath)) {
        diagnostics.push({ code: "META_MISSING", severity: "error", message: `${skill.name}: meta.json missing` });
      } else {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf8"));
          const keys = Object.keys(meta).sort().join(",");
          if (keys !== "description,instanceId,name"
            || meta.instanceId !== skill.instanceId || meta.name !== skill.name || meta.description !== skill.description) {
            diagnostics.push({ code: "META_DRIFT", severity: "error", message: `${skill.name}: meta.json disagrees with SQLite` });
          }
        } catch {
          diagnostics.push({ code: "META_INVALID", severity: "error", message: `${skill.name}: meta.json is invalid` });
        }
      }
    }
    for (const item of this.store.enablements()) {
      const skill = this.store.skills().find((candidate) => candidate.instanceId === item.skillId);
      if (skill && !enablementPathMatchesTarget(item, skill, process.env.SKLP_TEST_HOME)) {
        diagnostics.push({
          code: "TARGET_RECORD_DRIFT",
          severity: "error",
          message: `${item.targetKey}: recorded target or entry path is incorrect`
        });
      }
      if (!skill || managedLinkState(item.entryPath, this.skillPath(skill)) !== "correct") {
        diagnostics.push({ code: "ENABLEMENT_DRIFT", severity: "error", message: `${item.targetKey}: managed entry is missing or incorrect` });
      }
      if (!["symlink", "junction"].includes(item.linkType)
        || (process.platform !== "win32" && item.linkType !== "symlink")) {
        diagnostics.push({
          code: "LINK_TYPE_DRIFT",
          severity: "error",
          message: `${item.targetKey}: recorded link type is invalid for this platform`
        });
      }
    }
    if (!existsSync(this.paths.catalogJson) || !existsSync(this.paths.catalogMarkdown)) {
      diagnostics.push({ code: "CATALOG_MISSING", severity: "warning", message: "One or more catalog files are missing" });
    } else {
      try {
        const catalog = readFileSync(this.paths.catalogJson, "utf8");
        JSON.parse(catalog);
        if (catalog !== renderCatalogJson(skills)) {
          diagnostics.push({ code: "CATALOG_DRIFT", severity: "warning", message: "catalog.json disagrees with SQLite" });
        }
      } catch {
        diagnostics.push({ code: "CATALOG_INVALID", severity: "warning", message: "catalog.json is invalid" });
      }
      try {
        if (readFileSync(this.paths.catalogMarkdown, "utf8") !== renderCatalogMarkdown(skills)) {
          diagnostics.push({ code: "CATALOG_MARKDOWN_DRIFT", severity: "warning", message: "catalog.md disagrees with SQLite" });
        }
      } catch {
        diagnostics.push({ code: "CATALOG_MARKDOWN_INVALID", severity: "warning", message: "catalog.md is unreadable" });
      }
    }
    for (const project of this.store.projects()) {
      if (!existsSync(project) || !lstatSync(project).isDirectory()) {
        diagnostics.push({ code: "PROJECT_MISSING", severity: "warning", message: `Registered project no longer exists: ${project}` });
      }
    }
    for (const operation of this.store.interruptedOperations()) {
      diagnostics.push({
        code: "OPERATION_INTERRUPTED",
        severity: "warning",
        message: `${operation.kind} operation ${operation.id} did not finish`
      });
    }
    const knownTargets = new Set(managedTargetPaths(this.store.enablements()));
    for (const project of this.store.projects()) knownTargets.add(join(project, ".agents", "skills"));
    knownTargets.add(globalTarget(process.env.SKLP_TEST_HOME).path);
    if (!skillsDirectoryAvailable) return diagnostics.map(withDiagnosticSuggestion);
    const canonicalSkills = realpathSync(this.paths.skills);
    for (const target of knownTargets) {
      if (!existsSync(target)) continue;
      for (const entry of readdirSync(target)) {
        const path = join(target, entry);
        let resolved: string;
        try {
          resolved = realpathSync(path);
        } catch {
          continue;
        }
        if (!samePath(resolved, canonicalSkills) && isInside(canonicalSkills, resolved)
          && !this.store.enablementByEntry(path)) {
          diagnostics.push({ code: "UNREGISTERED_ENTRY", severity: "warning", message: `${path}: Hub link has no enablement record` });
        }
      }
    }
    return diagnostics.map(withDiagnosticSuggestion);
  }

  private requireSkill(name: string): Skill {
    const skill = this.store.skill(name);
    if (!skill) throw new CliError(`Skill not installed: ${name}`);
    return skill;
  }

  private mutate<T>(kind: string, fn: (checkpoint: (payload: RecoveryPayload) => void) => T): T {
    return withHubLock(this.paths, () => {
      this.recoverInterruptedOperations();
      const operationId = randomUUID();
      this.store.startOperation(operationId, kind, { kind, phase: "started" });
      try {
        const result = fn((payload) => this.store.updateOperationPayload(operationId, payload));
        this.store.finishOperation(operationId, "completed");
        return result;
      } catch (error) {
        if (!(error instanceof RecoveryPendingError)) this.store.finishOperation(operationId, "failed");
        throw error;
      }
    });
  }

  private recoverInterruptedOperations(): void {
    for (const operation of this.store.interruptedOperations()) {
      const payload = parseRecoveryPayload(operation.payload, operation.kind);
      if (!payload) {
        this.store.finishOperation(operation.id, "failed");
        continue;
      }
      const completed = this.recoverOperation(payload);
      this.store.finishOperation(operation.id, completed ? "completed" : "failed");
    }
  }

  private recoverOperation(payload: RecoveryPayload): boolean {
    this.assertRecoveryPaths(payload);
    switch (payload.kind) {
      case "install":
        return this.recoverInstall(payload);
      case "link":
        return this.recoverLink(payload);
      case "update":
        return this.recoverUpdate(payload);
      case "remove":
        return this.recoverRemove(payload);
      case "enable":
        return this.recoverEnable(payload);
      case "disable":
        return this.recoverDisable(payload);
    }
  }

  private recoverInstall(payload: Extract<RecoveryPayload, { kind: "install" }>): false {
    const installed = this.store.skill(payload.skill.name);
    if (installed && installed.instanceId !== payload.skill.instanceId) {
      throw new CliError(`Interrupted install conflicts with the installed Skill: ${payload.skill.name}`);
    }
    this.removeRecoveryOwnedSkill(payload.destination, payload.skill.instanceId);
    if (installed) this.store.transaction(() => this.store.deleteSkill(payload.skill.instanceId));
    writeCatalogs(this.paths, this.store.skills());
    return false;
  }

  private recoverLink(payload: Extract<RecoveryPayload, { kind: "link" }>): false {
    const installed = this.store.skill(payload.skill.name);
    if (installed && installed.instanceId !== payload.skill.instanceId) {
      throw new CliError(`Interrupted link conflicts with the installed Skill: ${payload.skill.name}`);
    }
    if (managedLinkState(payload.destination, payload.skill.sourceLocation) === "correct") {
      removeOwnedLink(payload.destination, payload.skill.sourceLocation);
    } else if (pathExistsLexically(payload.destination)) {
      throw new CliError(`Interrupted link found unmanaged Skill content: ${payload.destination}`);
    }
    if (installed) this.store.transaction(() => this.store.deleteSkill(payload.skill.instanceId));
    writeCatalogs(this.paths, this.store.skills());
    return false;
  }

  private recoverUpdate(payload: Extract<RecoveryPayload, { kind: "update" }>): boolean {
    if ("linked" in payload) return this.recoverLinkedUpdate(payload);
    if (existsSync(payload.backup)) {
      this.removeRecoveryOwnedSkill(payload.destination, payload.skill.instanceId);
      renameSync(payload.backup, payload.destination);
      const current = this.store.skill(payload.skill.name);
      this.store.transaction(() => {
        if (current) this.store.updateSkill(payload.skill);
        else this.store.insertSkill(payload.skill);
      });
      writeCatalogs(this.paths, this.store.skills());
      return false;
    }
    const current = this.store.skill(payload.skill.name);
    if (current && current.instanceId !== payload.skill.instanceId) {
      throw new CliError(`Interrupted update conflicts with the installed Skill: ${payload.skill.name}`);
    }
    if (!current || !existsSync(payload.destination)) {
      throw new CliError(`Interrupted update cannot be recovered safely: ${payload.skill.name}`);
    }
    if (current.updatedAt !== payload.skill.updatedAt) {
      this.assertRecoveryOwnedSkill(payload.destination, payload.skill.instanceId);
      if (!existsSync(join(payload.destination, "SKILL.md"))) {
        throw new CliError(`Interrupted update has invalid Skill content: ${payload.skill.name}`);
      }
      writeCatalogs(this.paths, this.store.skills());
      return true;
    }
    return false;
  }

  private recoverLinkedUpdate(payload: Extract<RecoveryPayload, { kind: "update"; linked: true }>): boolean {
    const current = this.store.skill(payload.skill.name);
    if (!current || current.instanceId !== payload.skill.instanceId) {
      throw new CliError(`Interrupted linked update conflicts with the installed Skill: ${payload.skill.name}`);
    }
    if (managedLinkState(payload.destination, current.sourceLocation) !== "correct") {
      throw new CliError(`Interrupted linked update cannot verify Skill content: ${payload.skill.name}`);
    }
    writeCatalogs(this.paths, this.store.skills());
    return true;
  }

  private recoverRemove(payload: Extract<RecoveryPayload, { kind: "remove" }>): boolean {
    const current = this.store.skill(payload.skill.name);
    if (current && current.instanceId !== payload.skill.instanceId) {
      throw new CliError(`Interrupted removal conflicts with the installed Skill: ${payload.skill.name}`);
    }
    if (!current && !existsSync(payload.destination) && !existsSync(payload.backup)) return true;
    if (existsSync(payload.backup)) {
      if (existsSync(payload.destination)) {
        throw new CliError(`Interrupted removal has conflicting Skill content: ${payload.skill.name}`);
      }
      renameSync(payload.backup, payload.destination);
    }
    if (!existsSync(payload.destination)) {
      throw new CliError(`Interrupted removal cannot restore Skill content: ${payload.skill.name}`);
    }
    if (!current) this.store.transaction(() => this.store.insertSkill(payload.skill));
    for (const enablement of payload.enablements) this.restoreEnablement(payload.skill, enablement);
    writeCatalogs(this.paths, this.store.skills());
    return false;
  }

  private recoverEnable(payload: Extract<RecoveryPayload, { kind: "enable" }>): boolean {
    const record = this.store.enablementByEntry(payload.enablement.entryPath);
    const state = managedLinkState(payload.enablement.entryPath, this.skillPath(payload.skill));
    if (record && record.skillId === payload.skill.instanceId && state === "correct") return true;
    if (record || state === "conflict") {
      throw new CliError(`Interrupted enablement cannot be recovered safely: ${payload.enablement.entryPath}`);
    }
    if (state === "correct") removeOwnedLink(payload.enablement.entryPath, this.skillPath(payload.skill));
    return false;
  }

  private recoverDisable(payload: Extract<RecoveryPayload, { kind: "disable" }>): boolean {
    const record = this.store.enablementByEntry(payload.enablement.entryPath);
    const state = managedLinkState(payload.enablement.entryPath, this.skillPath(payload.skill));
    if (!record && state === "absent") return true;
    if (state === "conflict") {
      throw new CliError(`Interrupted disablement cannot be recovered safely: ${payload.enablement.entryPath}`);
    }
    if (record && state === "absent") {
      const linkType = createDirectoryLink(this.skillPath(payload.skill), payload.enablement.entryPath);
      this.store.transaction(() => this.store.updateEnablementLinkType(record.id, linkType));
      return false;
    }
    if (!record && state === "correct") {
      this.store.transaction(() => this.store.insertEnablement(payload.enablement));
    }
    return false;
  }

  private restoreEnablement(skill: Skill, enablement: Enablement): void {
    const record = this.store.enablementByEntry(enablement.entryPath);
    const state = managedLinkState(enablement.entryPath, this.skillPath(skill));
    if (record && record.skillId !== skill.instanceId || state === "conflict") {
      throw new CliError(`Interrupted removal cannot restore an enablement safely: ${enablement.entryPath}`);
    }
    let linkType = enablement.linkType;
    if (state === "absent") linkType = createDirectoryLink(this.skillPath(skill), enablement.entryPath);
    if (!record) this.store.transaction(() => this.store.insertEnablement({ ...enablement, linkType }));
  }

  private removeRecoveryOwnedSkill(destination: string, instanceId: string): void {
    if (!existsSync(destination)) return;
    this.assertRecoveryOwnedSkill(destination, instanceId);
    rmSync(destination, { recursive: true });
  }

  private assertRecoveryOwnedSkill(destination: string, instanceId: string): void {
    try {
      const meta = JSON.parse(readFileSync(join(destination, "meta.json"), "utf8"));
      if (meta.instanceId !== instanceId) throw new Error("identity mismatch");
    } catch {
      throw new CliError(`Interrupted operation found unmanaged Skill content: ${destination}`);
    }
  }

  private assertRecoveryPaths(payload: RecoveryPayload): void {
    const destination = "destination" in payload ? payload.destination : this.skillPath(payload.skill);
    if (!isValidSkillName(payload.skill.name)
      || !isInside(this.paths.skills, destination)
      || samePath(destination, this.paths.skills)
      || !samePath(destination, this.skillPath(payload.skill))) {
      throw new CliError(`Interrupted ${payload.kind} operation contains an invalid Skill path.`);
    }
    if ("backup" in payload
      && (!isInside(this.paths.staging, payload.backup) || samePath(payload.backup, this.paths.staging))) {
      throw new CliError(`Interrupted ${payload.kind} operation contains an invalid backup path.`);
    }
    if ("enablement" in payload
      && !this.recoveryEnablementPathIsValid(payload.enablement, payload.skill)) {
      throw new CliError(`Interrupted ${payload.kind} operation contains an invalid entry path.`);
    }
    if ("enablements" in payload
      && !payload.enablements.every((item) => this.recoveryEnablementPathIsValid(item, payload.skill))) {
      throw new CliError(`Interrupted ${payload.kind} operation contains an invalid entry path.`);
    }
  }

  private recoveryEnablementPathIsValid(enablement: Omit<Enablement, "id">, skill: Skill): boolean {
    if (!enablementPathMatchesTarget(enablement, skill, process.env.SKLP_TEST_HOME)) return false;
    if (enablement.targetType !== "project") return true;
    if (!this.store.projects().some((project) => samePath(project, enablement.targetKey))) return false;
    try {
      return lstatSync(enablement.targetKey).isDirectory()
        && samePath(realpathSync(enablement.targetKey), enablement.targetKey);
    } catch {
      return false;
    }
  }

  private skillPath(skill: Skill): string {
    return join(this.paths.skills, skill.name);
  }

  private isLinkedSkill(skill: Skill): boolean {
    try {
      return lstatSync(this.skillPath(skill)).isSymbolicLink();
    } catch {
      return false;
    }
  }

  private updateLinkedSkill(current: Skill): Skill {
    const metadata = readSkillMetadata(this.skillPath(current));
    if (metadata.name !== current.name) throw new CliError("Updated Skill name changed; unlink and link it again.");
    const updated: Skill = {
      ...current,
      description: metadata.description,
      updatedAt: new Date().toISOString()
    };
    try {
      this.store.transaction(() => this.store.updateSkill(updated));
      writeCatalogs(this.paths, this.store.skills());
      this.assertEnablementsHealthy(updated);
      return updated;
    } catch (error) {
      try {
        this.store.transaction(() => this.store.updateSkill(current));
      } catch (rollbackError) {
        throw new RecoveryPendingError("Update", rollbackError);
      }
      this.writeCatalogsBestEffort();
      throw error;
    }
  }

  private resolveProject(explicit?: string) {
    const cwd = canonicalDirectory(explicit ?? process.cwd());
    const project = explicit
      ? this.store.projects().find((path) => samePath(path, cwd))
      : this.store.projects().find((path) => isDescendant(path, cwd));
    if (!project) throw new CliError("No initialized project found. Run `sklp init` in the project first.");
    return { type: "project" as const, key: project, path: join(project, ".agents", "skills") };
  }

  private resolveGlobal() {
    const target = globalTarget(process.env.SKLP_TEST_HOME);
    return { type: "global" as const, key: target.key, path: target.path };
  }

  private verifySkillEntry(entry: string, expected: string): void {
    if (managedLinkState(entry, expected) !== "correct") throw new CliError(`Managed entry verification failed: ${entry}`);
    if (!existsSync(join(entry, "SKILL.md"))) throw new CliError(`Agent cannot discover a valid SKILL.md at: ${entry}`);
  }

  private assertEnablementsHealthy(skill: Skill): void {
    for (const item of this.store.enablements(skill.instanceId)) this.verifySkillEntry(item.entryPath, this.skillPath(skill));
  }

  private disableEnablement(skill: Skill, record: Enablement): void {
    const state = managedLinkState(record.entryPath, this.skillPath(skill));
    if (state === "conflict") throw new CliError(`Refusing to remove unmanaged entry: ${record.entryPath}`);
    if (state === "correct") removeOwnedLink(record.entryPath, this.skillPath(skill));
    this.store.transaction(() => this.store.deleteEnablement(record.id));
  }

  private writeCatalogsBestEffort(): void {
    try {
      writeCatalogs(this.paths, this.store.skills());
    } catch {
      // A pre-existing projection conflict remains visible to the read-only doctor.
    }
  }
}

function canonicalDirectory(path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) throw new CliError(`Project directory does not exist: ${path}`);
  return realpathSync(resolved);
}

function samePath(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isDescendant(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && !rel.startsWith(".."));
}

function managedTargetPaths(enablements: Enablement[]): string[] {
  return [...new Set(enablements.map((item) => item.targetPath))];
}

function enablementHealth(entryPath: string, expected: string): EnablementInfo["health"] {
  const state = managedLinkState(entryPath, expected);
  if (state === "absent") return "missing";
  if (state === "conflict" || !existsSync(join(entryPath, "SKILL.md"))) return "conflict";
  return "healthy";
}

function withDiagnosticSuggestion(diagnostic: Omit<Diagnostic, "suggestion">): Diagnostic {
  return {
    ...diagnostic,
    suggestion: diagnosticSuggestion(diagnostic.code)
  };
}

function diagnosticSuggestion(code: string): string {
  switch (code) {
    case "HUB_SKILLS_UNAVAILABLE":
      return "Check that the Hub directory exists and is writable, then run `sklp init` again if the Hub was removed.";
    case "SKILL_CONTENT_MISSING":
    case "SKILL_METADATA_DRIFT":
    case "SKILL_METADATA_INVALID":
      return "Check the Skill source, then run `sklp update <skill>` or remove and install the Skill again.";
    case "LINK_SOURCE_DRIFT":
      return "Unlink the affected Skill with `sklp unlink <skill>` and link the local source again.";
    case "META_MISSING":
    case "META_DRIFT":
    case "META_INVALID":
      return "Check the installed Skill files, then run `sklp update <skill>` or reinstall the Skill.";
    case "TARGET_RECORD_DRIFT":
    case "ENABLEMENT_DRIFT":
    case "LINK_TYPE_DRIFT":
      return "Run `sklp info <skill>` to inspect enablements, then run `sklp disable <skill>` and `sklp enable <skill>` again if needed.";
    case "CATALOG_MISSING":
    case "CATALOG_DRIFT":
    case "CATALOG_INVALID":
    case "CATALOG_MARKDOWN_DRIFT":
    case "CATALOG_MARKDOWN_INVALID":
      return "Run a successful mutating command such as `sklp install`, `sklp update`, or `sklp remove` to regenerate catalogs.";
    case "PROJECT_MISSING":
      return "Run `sklp init` from an existing project directory to register a valid project.";
    case "OPERATION_INTERRUPTED":
      return "Run any normal mutating command to trigger startup recovery; inspect the Hub manually if this repeats.";
    case "UNREGISTERED_ENTRY":
      return "Remove the unmanaged entry manually or run `sklp enable <skill>` again after confirming the target is safe.";
    default:
      return "Inspect the reported path or state, then rerun `sklp doctor` after making changes.";
  }
}

function enablementPathMatchesTarget(item: Omit<Enablement, "id">, skill: Skill, home?: string): boolean {
  try {
    const targetPath = item.targetType === "project"
      ? join(item.targetKey, ".agents", "skills")
      : globalTarget(home).path;
    return samePath(item.targetPath, targetPath)
      && samePath(item.entryPath, join(targetPath, skill.name));
  } catch {
    return false;
  }
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function parseRecoveryPayload(value: unknown, kind: string): RecoveryPayload | null {
  if (!isRecord(value) || value.kind !== kind || !isSkill(value.skill)) return null;
  if (kind === "install" && typeof value.destination === "string") {
    return { kind, skill: value.skill, destination: value.destination };
  }
  if (kind === "link" && typeof value.destination === "string") {
    return { kind, skill: value.skill, destination: value.destination };
  }
  if (kind === "update" && typeof value.destination === "string" && typeof value.backup === "string") {
    return { kind, skill: value.skill, destination: value.destination, backup: value.backup };
  }
  if (kind === "update" && typeof value.destination === "string" && value.linked === true) {
    return { kind, skill: value.skill, destination: value.destination, linked: true };
  }
  if (kind === "remove" && typeof value.destination === "string" && typeof value.backup === "string"
    && Array.isArray(value.enablements) && value.enablements.every((item) => isEnablement(item))) {
    return {
      kind,
      skill: value.skill,
      destination: value.destination,
      backup: value.backup,
      enablements: value.enablements
    };
  }
  if (kind === "enable" && isEnablement(value.enablement, false)) {
    return { kind, skill: value.skill, enablement: value.enablement };
  }
  if (kind === "disable" && isEnablement(value.enablement)) {
    return { kind, skill: value.skill, enablement: value.enablement };
  }
  return null;
}

function isSkill(value: unknown): value is Skill {
  if (!isRecord(value)) return false;
  if (!("sourceTracking" in value)) value.sourceTracking = null;
  if (!("tags" in value)) value.tags = [];
  return typeof value.instanceId === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && (value.sourceType === "local" || value.sourceType === "git")
    && typeof value.sourceLocation === "string"
    && (value.sourceRef === null || typeof value.sourceRef === "string")
    && (value.sourceRevision === null || typeof value.sourceRevision === "string")
    && (value.sourceTracking === null || ["default-branch", "branch", "tag", "commit"].includes(String(value.sourceTracking)))
    && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")
    && typeof value.installedAt === "string"
    && typeof value.updatedAt === "string";
}

function isEnablement(value: unknown, requireId = true): value is Enablement {
  return isRecord(value)
    && (!requireId || typeof value.id === "number")
    && typeof value.skillId === "string"
    && (value.targetType === "project" || value.targetType === "global")
    && typeof value.targetKey === "string"
    && typeof value.targetPath === "string"
    && typeof value.entryPath === "string"
    && typeof value.linkType === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function pathExistsLexically(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
