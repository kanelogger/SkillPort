# Skill Port CLI

[中文文档](README.zh-CN.md)

Skill Port CLI keeps Agent Skills in one local Hub and enables them into projects or the shared global Agent directory.

## Requirements

- Node.js 24.15 or newer
- Git on `PATH` for Git-based installs

## Install

```bash
npm install --global skill-port-cli
```

The npm package name is `skill-port-cli`. The executable name is `sklp`.

## Core workflow

```bash
sklp init
sklp install ./path/to/a-skill
sklp link ./path/to/a-local-skill
sklp list
sklp info my-skill
sklp enable my-skill
sklp enable my-skill --global
sklp update my-skill
sklp doctor
sklp disable my-skill
sklp remove my-skill
sklp unlink my-local-skill
sklp uninstall
```

`sklp init` registers the current directory locally. Project enablement writes a managed entry under `.agents/skills/`; no Skill Port manifest or Git configuration is added to the project.

Project enablement uses `<project>/.agents/skills/`; the only global target is `~/.agents/skills/`.

The default Hub is `~/.skill-port`. Set `SKLP_HOME` for an isolated or custom Hub, or use `sklp init --hub <path>`.

## Desktop GUI development

The repository also contains an Electron GUI that uses the same Hub and core safety rules. See [Skill Port Desktop](docs/desktop.md). The Desktop app is currently an unsigned development MVP and is not included in the published CLI package.

## Uninstall

```bash
sklp uninstall
```

The command asks `Confirm uninstall sklp and delete its managed Skills? [y/N]`. Only an exact `y` proceeds. It removes Hub-recorded Agent entries, the active Hub and its managed Skills, the matching Hub locator, and the npm-global `skill-port-cli` package. Linked Skill source directories outside the Hub and the source checkout remain untouched. `sklp uninstall` has no `--yes` or `--json` mode.

Set `SKLP_LANG=zh-CN` to use Chinese command help and human-readable command output. JSON output remains stable and language-independent.

## Practical journey: share one Skill across projects

Imagine a team keeps a `debugging-playbook` Skill in a shared Git repository. One developer wants to use it in a backend service today, make it available through the shared global Agent directory tomorrow, and keep the Skill easy to update when the team improves it.

First, register the service project and install the shared Skill into the local Hub:

```bash
cd ~/work/billing-service
sklp init
sklp install https://github.com/example/debugging-playbook.git --ref v1.0.0
```

Now the Skill is stored once under `~/.skill-port`, and the current service project is known to Skill Port. Enable it in the project:

```bash
sklp enable debugging-playbook
```

Skill Port creates a managed entry under `~/work/billing-service/.agents/skills/`. The project can now use the Skill without copying the source into the repository, adding a manifest, or touching Git configuration.

Later, the same developer wants the Skill in the shared global Agent directory:

```bash
sklp enable debugging-playbook --global
```

This writes the global managed entry under `~/.agents/skills/`.

Project enablement and global enablement are tracked separately, so the Skill can be removed from one target without disturbing the other:

```bash
sklp disable debugging-playbook --global
sklp disable debugging-playbook
```

When the team publishes a new version, update the Hub copy and check for drift:

```bash
sklp update debugging-playbook
sklp info debugging-playbook
sklp doctor
```

`sklp info` shows where the Skill is enabled. `sklp doctor` is read-only and reports missing files, unmanaged target entries, broken links, or catalog drift with a concrete suggestion for each diagnostic.

Check a copied Git Skill before updating it:

```bash
sklp update debugging-playbook --check
sklp update debugging-playbook --check --json
```

Default-branch and branch-tracked Skills report `up-to-date` or `outdated`. Commit and tag selections report `pinned` and are never advanced by an update check. An inaccessible or ambiguous legacy source reports `unknown` and exits nonzero. Checks are read-only: they do not change the Hub, catalog, SQLite state, or managed entries.

Inspect or preview the complete installed fleet before updating it:

```bash
sklp update --all --check
sklp update my-skill --dry-run --json
sklp update --all --dry-run --json
sklp update --all --json
```

Fleet checks run in name order. Copied local Skills and linked Skills are reported as skips; tag and commit pins are skipped as `pinned`. `--dry-run` resolves the exact revisions that would be updated without changing the Hub. `--all` updates only copied Git Skills, keeps completed updates when another Skill fails, and returns `updated`, `skipped`, and `failed` arrays in JSON.

If the developer is actively editing the Skill locally instead of consuming a released copy, use `link`:

```bash
sklp link ~/work/skills/debugging-playbook
sklp enable debugging-playbook
```

The Hub records the Skill, but project and global enablements point back to the local source directory. Edits to `~/work/skills/debugging-playbook/SKILL.md` are visible immediately to enabled Agents. When local development is done:

```bash
sklp unlink debugging-playbook
```

Git repositories are also supported:

```bash
sklp install https://github.com/example/my-skill.git
sklp install https://github.com/example/my-skill.git --ref v1.2.0
sklp install https://github.com/example/skills.git --ref main --path skills/review-animations
sklp install https://github.com/example/skills/tree/main/skills/review-animations
```

Use `--path` when a Git repository keeps the Skill below the repository root. GitHub `tree/<ref>/<path>` URLs copied from the browser are also accepted. If the selected Git path does not contain `SKILL.md` directly, Skill Port scans that path for multiple Skill directories. Invalid sibling metadata does not block valid Skills in a multi-Skill import. When a GitHub URL installs at least two new valid Skills, each receives the GitHub owner as a Hub-only Publisher tag; use `sklp list --tag <owner>` to filter them case-insensitively. `--dry-run --json` lists installable, skipped, and failed entries; real installs still preflight duplicate names before writing state. Git commands disable terminal credential prompts and time out after 30 seconds by default; set `SKLP_GIT_TIMEOUT_MS` to use a different positive millisecond limit.

Registry files named `sources.json` are supported for local registry imports:

```bash
sklp install ./registry/sources.json
sklp install ./registry/sources.json --dry-run
sklp install ./registry/sources.json --skip-existing
```

Each registry entry must provide `local_path`. If `local_path/SKILL.md` exists, that directory is installed as one Skill. Otherwise Skill Port scans `local_path/**/SKILL.md` and installs each discovered Skill directory. Relative `local_path` values resolve from the `sources.json` directory first, then from its parent directory for registry layouts like `registry/sources.json` plus `warehouse/...`. Use `--dry-run` to preview the expanded Skill set without changing the Hub. Use `--skip-existing` to skip already installed Skills during repeated registry imports. Registry installs preflight duplicate names before writing state.

Use `sklp link <path>` for a local Skill you are actively editing. The Hub records the Skill and points its managed entry at the source directory, so edits are visible through project and global enablements without reinstalling. Use `sklp unlink <skill>` to remove that local registration; the original source directory is not deleted.

Use `--project <path>` with `init`, `enable`, or `disable` to target an explicit local project. The project must be registered before enablement.

## Global integrations with local runtimes

Some Skills depend on a machine-level runtime or a user-managed browser integration. Install and enable these Skills globally first; use project enablement only when a project needs an explicit entry point.

[BrowserSkill](https://github.com/Tencent/BrowserSkill) is the reference case: its `browser-skill` teaches an Agent to use the `bsk` CLI, but it also requires the `bsk` CLI/daemon and a BrowserSkill browser extension connected to the user's browser. Install the Skill from its repository and enable it globally:

```bash
sklp install https://github.com/Tencent/BrowserSkill.git --path skill
sklp enable browser-skill --global
```

Install the `bsk` runtime and the browser extension by following BrowserSkill's [official setup guide](https://github.com/Tencent/BrowserSkill#quick-start). Skill Port does not run third-party remote installer scripts and cannot install or configure a browser extension. A project that needs the Skill explicitly can then add its own managed entry:

```bash
sklp enable browser-skill --project ~/work/browser-automation
```

## Skill metadata

Every installed Skill must start `SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill
description: What the skill helps an Agent do.
---
```

Names use lowercase letters, digits, and single hyphens. Installed names are unique.

## Global targets

See [supported targets](docs/supported-targets.md). Global enablement always uses the shared Agent directory:

```bash
sklp enable my-skill --global
sklp disable my-skill --global
```

## Exit codes

See [exit codes](docs/exit-codes.md). Skill Port CLI uses `0` for successful commands and warning-only doctor results, and `1` for command failures or error-severity doctor diagnostics.

## Machine-readable output

Use `--json` for stable automation output. `sklp info <skill>` emits JSON by default. Public Skill JSON includes a `tags` array; Publisher tags remain Hub-only and never appear in catalog output. Runtime command failures invoked with `--json` write a JSON envelope to stdout and leave stderr empty:

```json
{
  "error": {
    "code": "COMMAND_FAILED",
    "message": "Skill not installed: example-skill"
  }
}
```

`doctor --json` keeps its diagnostic payload so automation can inspect individual health findings.

## Catalogs and privacy

The Hub automatically maintains:

- `catalog.json` for machines
- `catalog.md` for people
- `skills/<name>/meta.json` for copied installed Skills

Catalog entries contain only `instanceId`, `name`, and `description`. Project associations and source locations stay in local SQLite state. Linked local source directories are not modified by Skill Port.

## Safety

- Existing unmanaged target files, directories, and links are never overwritten.
- `remove` refuses while enablements exist; `remove --force` removes verified managed entries first.
- `unlink` only applies to linked local Skills; `unlink --force` first removes verified managed entries.
- `doctor` is read-only and reports an actionable suggestion for each diagnostic.
- Git is invoked without a shell, and credentials are removed from persisted and displayed source URLs.
