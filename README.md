# Skill Port

<p align="center">
  <img src="apps/desktop/assets/skill-port-icon.png" alt="Skill Port application icon" width="128">
</p>

[中文](README.zh-CN.md)

Every Skill you install teaches your Agent one more thing. After a while, those Skills end up scattered across projects. Some are copied twice, some are forgotten, and some need an update.

Skill Port is a toolbox. It keeps one local copy of each Skill, then makes that Skill available wherever you need it.

- **Desktop** is for people: manage Skills by clicking.
- **CLI** is for Agents: install it once, then ask your Agent to manage Skills for you.

## Quick start

You need Node.js 22.16 or newer. Git is also required when a Skill comes from a Git repository.

### Let your Agent install it

Paste this into a coding Agent that can run terminal commands:

> Base on https://github.com/kanelogger/SkillPort.Install Skill Port CLI globally with npm. Check that Node.js meets the requirement first, then run `sklp --version` and `sklp agent setup`. Report any permission or PATH errors.

### 1. Install the CLI

```bash
npm install --global skill-port-cli
sklp --version
sklp agent setup
```

The install also registers a bundled management Skill at `~/.agents/skills/skill-port`. It teaches compatible Agents how to operate `sklp`; it is separate from the Skills you add later.

Installation succeeded when `sklp --version` prints a version number and `sklp agent setup` reports that the Agent integration is registered. `setup` is safe to repeat and creates the entry if npm did not run the automatic setup.

### 2. Initialize Skill Port and register a project

Replace the example path with the project where you want to use Skills:

```bash
cd ~/projects/my-project
sklp init
```

The first `sklp init` creates the shared Hub at `~/.skill-port` and registers the current directory as a project. To register another project later, enter that project and run `sklp init` again; both projects use the same Hub.

### 3. Add a Skill to the Hub

Choose one command:

```bash
# Install from a Git repository
sklp install https://github.com/owner/my-skill.git

# Or copy a local Skill into the Hub
sklp install ~/skills/my-skill

# Or link a local Skill and keep using its original directory
sklp link ~/skills/my-skill
```

Replace the URL or path with the real Skill source. The command prints the Skill name after a successful install or link, for example `my-skill`.

### 4. Enable the Skill

Choose one target and use the Skill name printed by the previous command:

```bash
# Enable for the current registered project
sklp enable my-skill

# Or enable in the shared global Agent directory
sklp enable my-skill --global
```

Then verify the setup:

```bash
sklp doctor
```

Open a new Agent session after enabling the Skill so that a compatible Agent can discover it.

Apart from the new `~/.agents/skills/skill-port` management Skill, existing Skills under `~/.agents/skills` remain unchanged and continue to work. They are not automatically imported into the Hub, so no action is required.

### Update Git Skills

Check first, then update one Skill or the whole Hub:

```bash
sklp update my-skill --check
sklp update my-skill
sklp update --all
```

Skills installed from a branch or the repository's default branch follow later commits. A Skill installed from a tag or commit stays pinned; a normal update reports that pin instead of reinstalling the same revision. Change its tracking ref explicitly:

```bash
sklp update my-skill --ref main
sklp update --all --ref main
```

The batch form changes every Git-installed Skill to the requested ref and skips local copied or linked Skills. Batch checks and updates reuse one remote query and clone per repository/ref during the command.

### Sync a Git Skill collection

`update` refreshes already-installed Skills. Use `sync` when a repository directory can add or remove Skills:

```bash
# Preview additions, content updates, and upstream-missing Skills
sklp sync https://github.com/owner/skills.git --path skills --dry-run --json

# Add new Skills, update existing Skills, and retain missing local copies
sklp sync https://github.com/owner/skills.git --path skills

# Remove missing Skills that are not enabled
sklp sync --all --prune

# Explicitly disable managed targets before removing enabled missing Skills
sklp sync --all --prune --force
```

Git installs now register their repository URL, ref, and scan path as a source collection, so later `sklp sync --all` can reconcile every registered collection. For a Git Skill installed before this feature, run one explicit `sklp sync <repo> --path <path>` to adopt matching installed Skills safely.

Sync output separates `added`, `updated`, `unchanged`, `missing`, `removed`, and `failed` entries. A normal sync records upstream-missing membership but keeps the local copy. `--prune` is the deletion boundary: enabled missing Skills are skipped unless `--force` is also present. Invalid or duplicate upstream metadata is reported as a failure and is never treated as evidence that an installed Skill was deleted. Without a stable manifest identifier, a changed Skill name is represented as one addition and one missing Skill.

### Inspect and prune the Hub

Add one private tag to an explicit set of installed Skills:

```bash
sklp tag add develop code-review-helper skill-creator
sklp tag add develop code-review-helper skill-creator --dry-run --json
sklp list --tag develop
```

The batch command validates every Skill and the merged 32-tag limit before writing. It adds the tag in one transaction, preserves existing tags, and treats tag and Skill-name casing as equivalent for matching. `--dry-run` opens the Hub read-only. Private tags remain Hub-only and are excluded from exported catalogs and Skill files.

Show installation kind, enablement count, and health without exposing project paths:

```bash
sklp list --status
sklp list --status --json
```

Preview unused copied Skills before removing them:

```bash
sklp prune --dry-run --json
sklp prune --yes
```

`prune` considers only Skills with no enablements. It removes verified local or Git copies, preserves linked Skills and their external sources, and skips copies whose Skill Port ownership cannot be verified. Removal never starts without `--yes`.

### Export a shareable catalog

Generate one self-contained HTML file that can be opened offline or shared directly:

```bash
sklp export
sklp export ./team-skills.html --json
sklp export ./team-skills.html --force
```

The default output is `skill-port-catalog.html` in the current directory. The page supports live name/description search, light and dark themes, responsive cards, and click-to-copy Skill names. Existing output is preserved unless `--force` is explicit.

The exported page contains only Skill names and descriptions. It excludes instance IDs, Publisher tags, installation and enablement state, project paths, and source URLs or paths.

## Prefer buttons?

Install [Skill Port Desktop 0.1.4](https://github.com/kanelogger/SkillPort/releases/tag/desktop-v0.1.4).

1. On macOS, download `arm64.dmg` for Apple Silicon or `x64.dmg` for Intel. On Windows, download `Skill Port Setup.exe`.
2. Choose a project directory.
3. Install or link a Skill, then enable it for the project or globally.
4. For registered Git collections, use **Sync sources** to preview repository additions, updates, and missing Skills before applying them. Missing Skills stay local unless pruning is explicitly enabled; enabled missing Skills require a separate force confirmation.

On the first macOS launch, right-click the app and choose **Open**. Do not install the withdrawn Desktop 0.1.3. See the [Desktop guide](docs/desktop.md) for complete instructions.

## What it protects

- It does not overwrite files or links that it does not manage.
- It verifies managed entries before deleting them.
- `doctor` is always read-only.
- `link` does not modify or delete your original Skill directory.
- `prune` removes only unused copied Skills whose ownership metadata can be verified; linked Skills are preserved.
- Credentials in Git URLs do not enter public catalogs.
- Static catalog exports contain only public names and descriptions.

To remove Skill Port completely:

```bash
sklp uninstall
```

It asks you to type `y`, then removes only verified managed content. Linked Skill source directories outside the Hub remain in place.

## When you need more detail

- [Desktop installation and development](docs/desktop.md)
- [Supported directories](docs/supported-targets.md)
- [Exit codes](docs/exit-codes.md)
- [Version history](CHANGELOG.md)
- [Project context and design decisions](CONTEXT.md)
