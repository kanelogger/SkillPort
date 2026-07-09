import type { Skill } from "../domain/models.js";
import type { HubPaths } from "../infrastructure/config.js";
import { atomicWrite } from "../infrastructure/filesystem.js";

export function writeCatalogs(paths: HubPaths, skills: Skill[]): void {
  atomicWrite(paths.catalogJson, renderCatalogJson(skills));
  atomicWrite(paths.catalogMarkdown, renderCatalogMarkdown(skills));
}

export function renderCatalogJson(skills: Skill[]): string {
  const entries = registrationEntries(skills);
  return `${JSON.stringify({ schemaVersion: 1, skills: entries }, null, 2)}\n`;
}

export function renderCatalogMarkdown(skills: Skill[]): string {
  const lines = ["# Skill Port Catalog", "", ...registrationEntries(skills).flatMap((entry) => [
    `## ${entry.name}`,
    "",
    entry.description,
    ""
  ])];
  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeMeta(path: string, skill: Skill): void {
  atomicWrite(path, `${JSON.stringify({
    instanceId: skill.instanceId,
    name: skill.name,
    description: skill.description
  }, null, 2)}\n`);
}

function registrationEntries(skills: Skill[]) {
  return skills.map(({ instanceId, name, description }) => ({ instanceId, name, description }));
}
