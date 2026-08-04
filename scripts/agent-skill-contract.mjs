import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCliPath = resolve(root, "dist", "cli.js");
const defaultSkillPath = resolve(root, "agent-skill", "skill-port", "SKILL.md");
const digestMarkerPattern = /<!-- sklp-cli-surface-sha256: ([a-f0-9]{64}) -->/;
const digestMarkerPrefix = "<!-- sklp-cli-surface-sha256:";

function normalizeHelp(output) {
  return output
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function childCommandNames(help) {
  const lines = normalizeHelp(help).split("\n");
  const commandsIndex = lines.indexOf("Commands:");
  if (commandsIndex < 0) return [];

  const names = [];
  for (const line of lines.slice(commandsIndex + 1)) {
    if (/^[A-Z][^:]*:$/.test(line)) break;
    const match = /^ {2}([a-z][a-z0-9-]*)(?=\s|\[|<|$)/.exec(line);
    if (match && match[1] !== "help") names.push(match[1]);
  }
  return names;
}

function commandHelp(cliPath, commandPath, cwd) {
  const result = spawnSync(process.execPath, [cliPath, ...commandPath, "--help"], {
    cwd,
    env: {
      ...process.env,
      COLUMNS: "120",
      NO_COLOR: "1",
      SKLP_LANG: "en"
    },
    encoding: "utf8",
    shell: false
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`;
    throw new Error(`Could not read CLI help for sklp ${commandPath.join(" ")}: ${detail.trim()}`);
  }
  return normalizeHelp(result.stdout);
}

export function collectCliSurface({ cliPath = defaultCliPath, cwd = root } = {}) {
  const queue = [[]];
  const visited = new Set();
  const entries = [];

  while (queue.length > 0) {
    const commandPath = queue.shift();
    const key = commandPath.join(" ");
    if (visited.has(key)) continue;
    visited.add(key);

    const help = commandHelp(cliPath, commandPath, cwd);
    entries.push({ command: ["sklp", ...commandPath].join(" "), help });
    for (const child of childCommandNames(help)) queue.push([...commandPath, child]);
  }

  return entries;
}

export function cliSurfaceDigest(entries) {
  const canonical = entries
    .map(({ command, help }) => `## ${command}\n${normalizeHelp(help)}`)
    .join("\n\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function recordedCliSurfaceDigest(skillDocument) {
  return digestMarkerPattern.exec(skillDocument)?.[1] ?? null;
}

export function updateCliSurfaceDigest(skillDocument, digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid CLI surface digest: ${digest}`);
  const marker = `<!-- sklp-cli-surface-sha256: ${digest} -->`;
  if (digestMarkerPattern.test(skillDocument)) return skillDocument.replace(digestMarkerPattern, marker);
  if (skillDocument.includes(digestMarkerPrefix)) throw new Error("Malformed CLI surface digest marker in SKILL.md.");
  const heading = "# Skill Port\n";
  if (!skillDocument.includes(heading)) throw new Error("Could not find the Skill Port heading in SKILL.md.");
  return skillDocument.replace(heading, `${heading}\n${marker}\n`);
}

export function assertCliSurfaceDigest(skillDocument, expectedDigest) {
  const recorded = recordedCliSurfaceDigest(skillDocument);
  if (recorded === expectedDigest) return;
  throw new Error([
    "The bundled skill-port Skill is stale for the current CLI command surface.",
    `Expected: ${expectedDigest}`,
    `Recorded: ${recorded ?? "missing"}`,
    "Run `npm run sync:agent-skill`, then review SKILL.md guidance and evals for the changed commands or safety behavior."
  ].join("\n"));
}

export function inspectAgentSkillContract({ cliPath = defaultCliPath, skillPath = defaultSkillPath } = {}) {
  const entries = collectCliSurface({ cliPath, cwd: root });
  const digest = cliSurfaceDigest(entries);
  const skillDocument = readFileSync(skillPath, "utf8");
  return {
    digest,
    entries,
    skillDocument,
    skillPath
  };
}

function checkContract() {
  const contract = inspectAgentSkillContract();
  assertCliSurfaceDigest(contract.skillDocument, contract.digest);
}

function writeContract() {
  const contract = inspectAgentSkillContract();
  const updated = updateCliSurfaceDigest(contract.skillDocument, contract.digest);
  if (updated !== contract.skillDocument) writeFileSync(contract.skillPath, updated);
  console.log(`Recorded Agent Skill CLI surface: ${contract.digest} (${contract.entries.length} help pages).`);
  console.log("Review SKILL.md guidance and evals for every changed command, option, or safety behavior.");
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const mode = process.argv[2] ?? "--check";
  try {
    if (mode === "--check") checkContract();
    else if (mode === "--write") writeContract();
    else throw new Error(`Unknown option: ${mode}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
