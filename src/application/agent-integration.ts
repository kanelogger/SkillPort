import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CliError } from "../domain/errors.js";
import { readSkillMetadata } from "../domain/metadata.js";
import type { Diagnostic } from "../domain/models.js";
import { createDirectoryLink, managedLinkState, removeOwnedLink } from "../infrastructure/filesystem.js";
import { globalTarget } from "../infrastructure/targets.js";

const integrationName = "skill-port";

export type AgentIntegrationStatus = {
  status: "ready" | "missing" | "conflict";
  entryPath: string;
};

export type AgentIntegrationSetup = AgentIntegrationStatus & {
  status: "ready";
  created: boolean;
};

export function inspectAgentIntegration(home = agentHome()): AgentIntegrationStatus {
  const { source, entry } = integrationPaths(home);
  const state = managedLinkState(entry, source);
  if (state === "correct" && existsSync(join(entry, "SKILL.md"))) {
    return { status: "ready", entryPath: entry };
  }
  return { status: state === "absent" ? "missing" : "conflict", entryPath: entry };
}

export function setupAgentIntegration(home = agentHome()): AgentIntegrationSetup {
  const { source, entry } = integrationPaths(home);
  const metadata = readSkillMetadata(source);
  if (metadata.name !== integrationName) {
    throw new CliError(`Bundled Agent integration has an unexpected name: ${metadata.name}`);
  }
  const status = inspectAgentIntegration(home);
  if (status.status === "ready") return { ...status, status: "ready", created: false };
  if (status.status === "conflict") {
    throw new CliError(`Refusing to overwrite unmanaged Agent integration: ${entry}`);
  }
  createDirectoryLink(source, entry);
  if (inspectAgentIntegration(home).status !== "ready") {
    throw new CliError(`Agent integration verification failed: ${entry}`);
  }
  return { status: "ready", entryPath: entry, created: true };
}

export function removeAgentIntegration(home = agentHome()): boolean {
  const { source, entry } = integrationPaths(home);
  const status = inspectAgentIntegration(home);
  if (status.status === "missing") return false;
  if (status.status === "conflict") {
    throw new CliError(`Refusing to remove unmanaged Agent integration: ${entry}`);
  }
  removeOwnedLink(entry, source);
  return true;
}

export function diagnoseAgentIntegration(home = agentHome()): Diagnostic[] {
  const status = inspectAgentIntegration(home);
  if (status.status === "ready") return [];
  if (status.status === "missing") {
    return [{
      code: "AGENT_INTEGRATION_MISSING",
      severity: "warning",
      message: `Skill Port Agent integration is not installed: ${status.entryPath}`,
      suggestion: "Run `sklp agent setup` to make Skill Port discoverable to local Agents."
    }];
  }
  return [{
    code: "AGENT_INTEGRATION_CONFLICT",
    severity: "error",
    message: `Agent integration entry is unmanaged or points elsewhere: ${status.entryPath}`,
    suggestion: "Inspect the existing entry, remove it only if it is safe, then run `sklp agent setup`."
  }];
}

function integrationPaths(home: string): { source: string; entry: string } {
  const source = fileURLToPath(new URL("../../agent-skill/skill-port", import.meta.url));
  return { source, entry: join(globalTarget(home).path, integrationName) };
}

function agentHome(): string {
  return process.env.SKLP_TEST_HOME ?? homedir();
}
