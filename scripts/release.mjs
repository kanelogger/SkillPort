import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = "https://registry.npmjs.org";
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
let releaseCache;

export function parseArguments(argv) {
  const result = {
    selector: undefined,
    notes: [],
    yes: false,
    dryRun: false,
    resume: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--yes" || argument === "-y") {
      result.yes = true;
    } else if (argument === "--dry-run") {
      result.dryRun = true;
    } else if (argument === "--resume") {
      result.resume = true;
    } else if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (argument === "--note") {
      const note = argv[index + 1];
      if (!note || note.startsWith("--")) {
        throw new Error("--note requires text.");
      }
      result.notes.push(note.trim());
      index += 1;
    } else if (argument.startsWith("--note=")) {
      result.notes.push(argument.slice("--note=".length).trim());
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (result.selector) {
      throw new Error(`Unexpected argument: ${argument}`);
    } else {
      result.selector = argument;
    }
  }

  if (result.resume && (result.selector || result.notes.length > 0)) {
    throw new Error("--resume cannot be combined with a version or --note.");
  }
  if (result.notes.some((note) => note.length === 0)) {
    throw new Error("Release notes cannot be empty.");
  }
  return result;
}

export function resolveReleaseVersion(currentVersion, selector) {
  const current = parseStableVersion(currentVersion, "Current package version");
  if (["patch", "minor", "major"].includes(selector)) {
    const [major, minor, patch] = current;
    if (selector === "patch") return `${major}.${minor}.${patch + 1}`;
    if (selector === "minor") return `${major}.${minor + 1}.0`;
    return `${major + 1}.0.0`;
  }

  const target = parseStableVersion(selector, "Release version");
  if (compareVersions(target, current) <= 0) {
    throw new Error(`Release version must be greater than ${currentVersion}.`);
  }
  return selector;
}

function parseStableVersion(version, label) {
  const match = stableVersionPattern.exec(version ?? "");
  if (!match) {
    throw new Error(`${label} must use stable x.y.z SemVer.`);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function npmCommand(args, options = {}) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run this release through `npm run release`, so npm_execpath is available.");
  }
  return command(process.execPath, [npmCli, ...args], options);
}

function npmEnvironment() {
  if (!releaseCache) {
    releaseCache = mkdtempSync(resolve(tmpdir(), "sklp-release-npm-"));
    process.once("exit", () => rmSync(releaseCache, { recursive: true, force: true }));
  }
  return { ...process.env, npm_config_cache: releaseCache };
}

function command(executable, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: executable === process.execPath ? npmEnvironment() : process.env,
    shell: false,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${executable} ${args.join(" ")} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

function output(executable, args) {
  return command(executable, args, { capture: true }).stdout.trim();
}

function readPackage() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
}

function changelogHasVersion(version) {
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  return new RegExp(`^## ${version.replaceAll(".", "\\.")}\\b`, "m").test(changelog);
}

function addChangelogEntry(version, notes) {
  if (changelogHasVersion(version)) return;
  const path = resolve(root, "CHANGELOG.md");
  const changelog = readFileSync(path, "utf8");
  const date = new Date().toISOString().slice(0, 10);
  const entry = `## ${version} - ${date}\n\n### Changes\n\n${notes.map((note) => `- ${note}`).join("\n")}\n\n`;
  writeFileSync(path, changelog.replace(/^# Changelog\n\n/, `# Changelog\n\n${entry}`));
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 15)) {
    throw new Error(`Node.js >=24.15.0 is required; found ${process.versions.node}.`);
  }
}

function assertGitState({ resume }) {
  if (output("git", ["branch", "--show-current"]) !== "main") {
    throw new Error("Releases must run from the main branch.");
  }
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("The Git worktree must be clean before a release.");
  }

  command("git", ["fetch", "origin", "main"]);
  const counts = output("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"])
    .split(/\s+/)
    .map(Number);
  const [ahead, behind] = counts;
  if (behind > 0) {
    throw new Error("Local main is behind or diverged from origin/main. Synchronize it before releasing.");
  }
  if (!resume && ahead > 0) {
    throw new Error("Local main has unpushed commits. Push them and wait for CI before releasing.");
  }
}

function tagPackageVersion(tag) {
  const result = command("git", ["show", `${tag}:package.json`], { capture: true, allowFailure: true });
  if (result.status !== 0) return null;
  try {
    const manifest = JSON.parse(result.stdout);
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

function publishedVersion(packageName, version) {
  const result = npmCommand(["view", `${packageName}@${version}`, "version", `--registry=${registry}`], {
    capture: true,
    allowFailure: true,
  });
  if (result.status === 0) return result.stdout.trim().replaceAll('"', "") === version;
  const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/E404|404 Not Found/i.test(detail)) return false;
  throw new Error(`Could not check npm version availability.\n${detail.trim()}`);
}

function runReleaseGates() {
  const gates = [
    ["run", "lint"],
    ["run", "typecheck"],
    ["test"],
    ["run", "test:platform"],
    ["run", "test:discovery"],
    ["run", "test:package"],
    ["audit", "--omit=dev"],
  ];
  for (const args of gates) npmCommand(args);
}

function printHelp() {
  console.log(`Usage:
  npm run release -- <patch|minor|major|x.y.z> --note "Change summary"
  npm run release -- --resume

Options:
  --note <text>  Add a CHANGELOG bullet; repeat for multiple changes
  --yes, -y      Skip the final interactive confirmation
  --dry-run      Validate local inputs and print the release plan only
  --resume       Resume the current version after publish or push failed
  --help, -h     Show this help`);
}

async function promptForMissingInput(args, currentVersion) {
  if (args.resume || (args.selector && (args.notes.length > 0 || changelogHasVersion(resolveReleaseVersion(currentVersion, args.selector))))) {
    return args;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Provide a version selector and at least one --note in non-interactive mode.");
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!args.selector) {
      const selector = (await readline.question("Release version (patch/minor/major/x.y.z) [patch]: ")).trim();
      args.selector = selector || "patch";
    }
    const target = resolveReleaseVersion(currentVersion, args.selector);
    if (args.notes.length === 0 && !changelogHasVersion(target)) {
      const note = (await readline.question("CHANGELOG summary: ")).trim();
      if (!note) throw new Error("A CHANGELOG summary is required.");
      args.notes.push(note);
    }
  } finally {
    readline.close();
  }
  return args;
}

async function confirmRelease(version, args) {
  if (args.yes || args.dryRun) return;
  if (!process.stdin.isTTY) throw new Error("Use --yes for a non-interactive release.");
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await readline.question(`Publish skill-port-cli@${version} to npm? Type "publish": `)).trim();
    if (answer !== "publish") throw new Error("Release cancelled.");
  } finally {
    readline.close();
  }
}

async function main() {
  const initialArgs = parseArguments(process.argv.slice(2));
  if (initialArgs.help) {
    printHelp();
    return;
  }

  assertNodeVersion();
  const currentPackage = readPackage();
  const args = await promptForMissingInput(initialArgs, currentPackage.version);
  const version = args.resume ? currentPackage.version : resolveReleaseVersion(currentPackage.version, args.selector);
  const tag = `v${version}`;

  assertGitState(args);
  if (args.resume && tagPackageVersion(tag) !== version) {
    throw new Error(`--resume requires ${tag} to contain package version ${version}.`);
  }
  if (!args.resume && command("git", ["rev-parse", "--verify", tag], { capture: true, allowFailure: true }).status === 0) {
    throw new Error(`Git tag ${tag} already exists.`);
  }

  console.log(`Release plan: ${currentPackage.name}@${version}${args.resume ? " (resume)" : ""}`);
  if (args.dryRun) return;

  npmCommand(["whoami", `--registry=${registry}`]);
  const alreadyPublished = publishedVersion(currentPackage.name, version);
  if (alreadyPublished && !args.resume) {
    throw new Error(`${currentPackage.name}@${version} is already published.`);
  }
  await confirmRelease(version, args);
  runReleaseGates();

  if (!args.resume) {
    npmCommand(["version", version, "--no-git-tag-version", "--workspaces=false"]);
    addChangelogEntry(version, args.notes);
    npmCommand(["pack", "--dry-run"]);
    command("git", ["add", "package.json", "package-lock.json", "CHANGELOG.md"]);
    command("git", ["commit", "-m", `chore: prepare ${tag} release`]);
    command("git", ["tag", "--annotate", tag, "--message", `Release ${tag}`]);
  }

  if (!alreadyPublished) npmCommand(["publish", "--access", "public"]);
  command("git", ["push", "origin", "HEAD:main"]);
  command("git", ["push", "origin", tag]);
  npmCommand(["run", "smoke:published", "--", tag]);
  console.log(`Published ${currentPackage.name}@${version} and verified the installed package.`);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((error) => {
    console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
