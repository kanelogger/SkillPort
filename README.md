# Skill Port CLI

Skill Port CLI keeps Agent Skills in one local Hub and enables them into projects or supported global Agent directories.

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
sklp enable my-skill --global codex
sklp update my-skill
sklp doctor
sklp disable my-skill
sklp remove my-skill
sklp unlink my-local-skill
```

`sklp init` registers the current directory locally. Project enablement writes a managed entry under `.agents/skills/`; no Skill Port manifest or Git configuration is added to the project.

The default Hub is `~/.skill-port`. Set `SKLP_HOME` for an isolated or custom Hub, or use `sklp init --hub <path>`.

Git repositories are also supported:

```bash
sklp install https://github.com/example/my-skill.git
sklp install https://github.com/example/my-skill.git --ref v1.2.0
```

Registry files named `sources.json` are supported for local registry imports:

```bash
sklp install ./registry/sources.json
```

Each registry entry must provide `local_path`. If `local_path/SKILL.md` exists, that directory is installed as one Skill. Otherwise Skill Port scans `local_path/**/SKILL.md` and installs each discovered Skill directory. Relative `local_path` values resolve from the `sources.json` directory first, then from its parent directory for registry layouts like `registry/sources.json` plus `warehouse/...`.

Use `sklp link <path>` for a local Skill you are actively editing. The Hub records the Skill and points its managed entry at the source directory, so edits are visible through project and global enablements without reinstalling. Use `sklp unlink <skill>` to remove that local registration; the original source directory is not deleted.

Use `--project <path>` with `init`, `enable`, or `disable` to target an explicit local project. The project must be registered before enablement.

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

See [supported targets](docs/supported-targets.md). Global enablement always names one tool:

```bash
sklp enable my-skill --global claude
sklp disable my-skill --global claude
```

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
- `doctor` is read-only.
- Git is invoked without a shell, and credentials are removed from persisted and displayed source URLs.
