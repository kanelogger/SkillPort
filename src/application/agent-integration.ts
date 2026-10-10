import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CliError } from "../domain/errors.js";
import { readSkillMetadata } from "../domain/metadata.js";
import type { Diagnostic } from "../domain/models.js";
import { createDirectoryLink, managedLinkState, removeOwnedLink } from "../infrastructure/filesystem.js";
import { globalTarget } from "../infrastructure/targets.js";

type BundledIntegration = {
  name: string;
  directory: string;
};

const bundledIntegrations: readonly BundledIntegration[] = [
  { name: "skill-port", directory: "skill-port" },
  { name: "skill-port-report", directory: "skill-port-report" }
];

export type AgentIntegrationStatus = {
  name: string;
  status: "ready" | "missing" | "conflict";
  entryPath: string;
};

export type AgentIntegrationSetup = AgentIntegrationStatus & {
  status: "ready";
  created: boolean;
};

export type AgentIntegrationsSetup = {
  integrations: AgentIntegrationSetup[];
  created: boolean;
};

export function inspectAgentIntegrations(home = agentHome()): AgentIntegrationStatus[] {
  return bundledIntegrations.map((definition) => inspectOne(definition, home));
}

export function setupAgentIntegration(home = agentHome()): AgentIntegrationsSetup {
  const inspected = inspectAgentIntegrations(home);
  const conflicts = inspected.filter((item) => item.status === "conflict");
  if (conflicts.length > 0) {
    throw new CliError(
      `Refusing to overwrite unmanaged Agent integration: ${conflicts.map((item) => item.entryPath).join(", ")}`
    );
  }

  const integrations: AgentIntegrationSetup[] = [];
  for (const definition of bundledIntegrations) {
    const { source, entry } = integrationPaths(definition, home);
    const metadata = readSkillMetadata(source);
    if (metadata.name !== definition.name) {
      throw new CliError(`Bundled Agent integration has an unexpected name: ${metadata.name}`);
    }
    const before = inspectOne(definition, home);
    if (before.status === "ready") {
      integrations.push({ ...before, status: "ready", created: false });
      continue;
    }
    createDirectoryLink(source, entry);
    if (inspectOne(definition, home).status !== "ready") {
      throw new CliError(`Agent integration verification failed: ${entry}`);
    }
    integrations.push({ name: definition.name, status: "ready", entryPath: entry, created: true });
  }
  return {
    integrations,
    created: integrations.some((item) => item.created)
  };
}

export function removeAgentIntegration(home = agentHome()): boolean {
  let removed = false;
  const conflicts: string[] = [];
  for (const definition of bundledIntegrations) {
    const { source, entry } = integrationPaths(definition, home);
    const status = inspectOne(definition, home);
    if (status.status === "missing") continue;
    if (status.status === "conflict") {
      conflicts.push(entry);
      continue;
    }
    removeOwnedLink(entry, source);
    removed = true;
  }
  if (conflicts.length > 0) {
    throw new CliError(`Refusing to remove unmanaged Agent integration: ${conflicts.join(", ")}`);
  }
  return removed;
}

export function diagnoseAgentIntegration(home = agentHome()): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const status of inspectAgentIntegrations(home)) {
    if (status.status === "ready") continue;
    if (status.status === "missing") {
      diagnostics.push({
        code: "AGENT_INTEGRATION_MISSING",
        severity: "warning",
        message: `Skill Port Agent integration is not installed: ${status.entryPath}`,
        suggestion: "Run `sklp agent setup` to make Skill Port discoverable to local Agents."
      });
      continue;
    }
    diagnostics.push({
      code: "AGENT_INTEGRATION_CONFLICT",
      severity: "error",
      message: `Agent integration entry is unmanaged or points elsewhere: ${status.entryPath}`,
      suggestion: "Inspect the existing entry, remove it only if it is safe, then run `sklp agent setup`."
    });
  }
  return diagnostics;
}

function inspectOne(definition: BundledIntegration, home: string): AgentIntegrationStatus {
  const { source, entry } = integrationPaths(definition, home);
  const state = managedLinkState(entry, source);
  if (state === "correct" && existsSync(join(entry, "SKILL.md"))) {
    return { name: definition.name, status: "ready", entryPath: entry };
  }
  return {
    name: definition.name,
    status: state === "absent" ? "missing" : "conflict",
    entryPath: entry
  };
}

function integrationPaths(definition: BundledIntegration, home: string): { source: string; entry: string } {
  const source = fileURLToPath(new URL(`../../agent-skill/${definition.directory}`, import.meta.url));
  return { source, entry: join(globalTarget(home).path, definition.name) };
}

function agentHome(): string {
  return process.env.SKLP_TEST_HOME ?? homedir();
}
