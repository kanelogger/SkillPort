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
sklp list
sklp info my-skill
sklp enable my-skill
sklp enable my-skill --global codex
sklp update my-skill
sklp doctor
sklp disable my-skill
sklp remove my-skill
```

`sklp init` registers the current directory locally. Project enablement writes a managed entry under `.agents/skills/`; no Skill Port manifest or Git configuration is added to the project.

The default Hub is `~/.skill-port`. Set `SKLP_HOME` for an isolated or custom Hub, or use `sklp init --hub <path>`.

Git repositories are also supported:

```bash
sklp install https://github.com/example/my-skill.git
sklp install https://github.com/example/my-skill.git --ref v1.2.0
```

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
- `skills/<name>/meta.json` for per-Skill registration

Catalog entries contain only `instanceId`, `name`, and `description`. Project associations and source locations stay in local SQLite state.

## Safety

- Existing unmanaged target files, directories, and links are never overwritten.
- `remove` refuses while enablements exist; `remove --force` removes verified managed entries first.
- `doctor` is read-only.
- Git is invoked without a shell, and credentials are removed from persisted and displayed source URLs.
