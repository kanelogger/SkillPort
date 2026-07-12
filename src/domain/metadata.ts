import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { CliError } from "./errors.js";

export type SkillMetadata = { name: string; description: string };

const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reserved = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
]);

export function isValidSkillName(name: string): boolean {
  return validName.test(name) && !reserved.has(name);
}

export function readSkillMetadata(root: string): SkillMetadata {
  let contents: string;
  try {
    contents = readFileSync(join(root, "SKILL.md"), "utf8");
  } catch {
    throw new CliError("Skill source must contain SKILL.md.");
  }
  const lines = contents.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new CliError("SKILL.md must start with YAML frontmatter.");
  const end = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (end < 0) throw new CliError("SKILL.md frontmatter is not closed.");
  const document = parseDocument(lines.slice(1, end + 1).join("\n"));
  if (document.errors.length > 0) throw new CliError(`Invalid SKILL.md frontmatter: ${document.errors[0]?.message}`);
  const value = document.toJSON() as Record<string, unknown> | null;
  const name = typeof value?.name === "string" ? value.name.trim() : "";
  const description = typeof value?.description === "string" ? value.description.trim() : "";
  if (!isValidSkillName(name)) {
    const suggestion = suggestedSkillName(name);
    throw new CliError(
      `Skill name must use lowercase letters, digits, and single hyphens.${suggestion ? ` Suggested name: ${suggestion}.` : ""}`
    );
  }
  if (!description) throw new CliError("Skill description is required.");
  return { name, description };
}

function suggestedSkillName(name: string): string | null {
  const suggestion = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return suggestion && suggestion !== name && isValidSkillName(suggestion) ? suggestion : null;
}
