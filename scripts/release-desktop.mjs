import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseDesktopReleaseArguments(argv) {
  const result = { selector: undefined, yes: false, dryRun: false, resume: false, help: false };
  for (const argument of argv) {
    if (argument === "--yes" || argument === "-y") result.yes = true;
    else if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--resume") result.resume = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (result.selector) throw new Error(`Unexpected argument: ${argument}`);
    else result.selector = argument;
  }
  if (result.resume && result.selector) throw new Error("--resume cannot be combined with a version.");
  return result;
}

export function resolveDesktopReleaseVersion(currentVersion, selector) {
  const current = parseStableVersion(currentVersion, "Current Desktop version");
  if (["patch", "minor", "major"].includes(selector)) {
    const [major, minor, patch] = current;
    if (selector === "patch") return `${major}.${minor}.${patch + 1}`;
    if (selector === "minor") return `${major}.${minor + 1}.0`;
    return `${major + 1}.0.0`;
  }
  const target = parseStableVersion(selector, "Desktop release version");
  if (compareVersions(target, current) <= 0) {
    throw new Error(`Desktop release version must be greater than ${currentVersion}.`);
  }
  return selector;
}

function parseStableVersion(version, label) {
  const match = stableVersionPattern.exec(version ?? "");
  if (!match) throw new Error(`${label} must use stable x.y.z SemVer.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function command(executable, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: false,
    stdio: capture ? "pipe" : "inherit"
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

function npmCommand(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this release through `npm run release:desktop`, so npm_execpath is available.");
  return command(process.execPath, [npmCli, ...args]);
}

function readDesktopPackage() {
  return JSON.parse(readFileSync(resolve(root, "apps/desktop/package.json"), "utf8"));
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 15)) {
    throw new Error(`Node.js >=24.15.0 is required; found ${process.versions.node}.`);
  }
}

function assertGitState({ resume }) {
  if (output("git", ["branch", "--show-current"]) !== "main") {
    throw new Error("Desktop releases must run from the main branch.");
  }
  if (output("git", ["status", "--porcelain"])) {
    throw new Error("The Git worktree must be clean before a Desktop release.");
  }
  command("git", ["fetch", "origin", "main"]);
  const [ahead, behind] = output("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"])
    .split(/\s+/)
    .map(Number);
  if (behind > 0) throw new Error("Local main is behind or diverged from origin/main. Synchronize it before releasing.");
  if (!resume && ahead > 0) throw new Error("Local main has unpushed commits. Push them and wait for CI before releasing.");
}

function tagDesktopVersion(tag) {
  const result = command("git", ["show", `${tag}:apps/desktop/package.json`], { capture: true, allowFailure: true });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout).version ?? null;
  } catch {
    return null;
  }
}

function assertRemoteTagAbsent(tag) {
  const result = command("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], {
    capture: true,
    allowFailure: true
  });
  if (result.status === 0) throw new Error(`Remote Git tag ${tag} already exists.`);
  if (result.status !== 2) throw new Error(`Could not check whether remote Git tag ${tag} exists.`);
}

function runReleaseGates() {
  for (const args of [
    ["run", "lint"],
    ["run", "typecheck"],
    ["test"],
    ["run", "desktop:typecheck"],
    ["run", "desktop:test"],
    ["run", "desktop:e2e"]
  ]) npmCommand(args);
}

function printHelp() {
  console.log(`Usage:
  npm run release:desktop -- <patch|minor|major|x.y.z>
  npm run release:desktop -- --resume

Options:
  --yes, -y      Skip the final interactive confirmation
  --dry-run      Validate local inputs and print the release plan only
  --resume       Push an already-created Desktop release commit and tag
  --help, -h     Show this help`);
}

async function promptForVersion(args, currentVersion) {
  if (args.resume || args.selector) return args;
  if (!process.stdin.isTTY) throw new Error("Provide a version selector in non-interactive mode.");
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const selector = (await readline.question("Desktop release version (patch/minor/major/x.y.z) [patch]: ")).trim();
    args.selector = selector || "patch";
    resolveDesktopReleaseVersion(currentVersion, args.selector);
    return args;
  } finally {
    readline.close();
  }
}

async function confirmRelease(tag, args) {
  if (args.yes || args.dryRun) return;
  if (!process.stdin.isTTY) throw new Error("Use --yes for a non-interactive release.");
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await readline.question(`Publish Desktop ${tag} to GitHub Releases? Type "release": `)).trim();
    if (answer !== "release") throw new Error("Desktop release cancelled.");
  } finally {
    readline.close();
  }
}

async function main() {
  const initialArgs = parseDesktopReleaseArguments(process.argv.slice(2));
  if (initialArgs.help) return printHelp();

  assertNodeVersion();
  const desktopPackage = readDesktopPackage();
  const args = await promptForVersion(initialArgs, desktopPackage.version);
  const version = args.resume ? desktopPackage.version : resolveDesktopReleaseVersion(desktopPackage.version, args.selector);
  const tag = `desktop-v${version}`;

  assertGitState(args);
  if (args.resume) {
    if (tagDesktopVersion(tag) !== version) throw new Error(`--resume requires ${tag} to contain Desktop version ${version}.`);
  } else {
    if (command("git", ["rev-parse", "--verify", tag], { capture: true, allowFailure: true }).status === 0) {
      throw new Error(`Git tag ${tag} already exists.`);
    }
    assertRemoteTagAbsent(tag);
  }

  console.log(`Desktop release plan: Skill Port ${version}${args.resume ? " (resume)" : ""}`);
  if (args.dryRun) return;

  await confirmRelease(tag, args);
  if (!args.resume) {
    runReleaseGates();
    npmCommand(["version", version, "--workspace=skill-port-desktop", "--no-git-tag-version"]);
    command("git", ["add", "apps/desktop/package.json", "package-lock.json"]);
    command("git", ["commit", "-m", `chore: prepare ${tag} release`]);
    command("git", ["tag", "--annotate", tag, "--message", `Release ${tag}`]);
  }
  command("git", ["push", "origin", "HEAD:main"]);
  command("git", ["push", "origin", tag]);
  console.log(`Pushed ${tag}. GitHub Actions will build installers and publish https://github.com/kanelogger/SkillPort/releases/tag/${tag}`);
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((error) => {
    console.error(`Desktop release failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
