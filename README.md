# Skill Port

<p align="center">
  <img src="apps/desktop/assets/skill-port-icon.png" alt="Skill Port application icon" width="128">
</p>

[中文](README.zh-CN.md)

**Version: 0.5.1** · [Changelog](CHANGELOG.md)

Every Skill you install teaches your Agent one more thing. After a while, those Skills end up scattered across projects. Some are copied twice, some are forgotten, and some need an update.

Skill Port is a toolbox. It keeps one local copy of each Skill, then makes that Skill available wherever you need it.

- **Desktop** is for people: manage Skills by clicking.
- **CLI** is for Agents: install it once, then ask your Agent to manage Skills for you.

## The easiest way: ask your Agent

You need Node.js 24.15 or newer. Git is also required when a Skill comes from a Git repository.

### Step 1: Install

```bash
npm install --global skill-port-cli
```

The package is named `skill-port-cli`. The command is `sklp`.

### Step 2: Start a new Agent session

During installation, Skill Port places a short instruction at:

```text
~/.agents/skills/skill-port
```

Compatible Agents discover it in a new session. You do not need to edit `AGENTS.md`.

### Step 3: Ask in plain language

For example:

```text
Install this Skill for me: https://github.com/example/my-skill.git
Enable my-skill in this project.
Check whether my Skills are healthy.
```

Your Agent will call `sklp`, so you do not need to remember the commands.

If it does not discover Skill Port, run `setup` and start another session. If the problem remains, use `doctor` to inspect it:

```bash
sklp agent setup
sklp doctor
```

`setup` is safe to run more than once and will not overwrite an entry that Skill Port does not own. `doctor` only checks; it does not change anything.

## Prefer buttons?

Install [Skill Port Desktop 0.1.4](https://github.com/kanelogger/SkillPort/releases/tag/desktop-v0.1.4).

1. On macOS, download `arm64.dmg` for Apple Silicon or `x64.dmg` for Intel. On Windows, download `Skill Port Setup.exe`.
2. Choose a project directory.
3. Install or link a Skill, then enable it for the project or globally.

On the first macOS launch, right-click the app and choose **Open**. Do not install the withdrawn Desktop 0.1.3. See the [Desktop guide](docs/desktop.md) for complete instructions.

## What it protects

- It does not overwrite files or links that it does not manage.
- It verifies managed entries before deleting them.
- `doctor` is always read-only.
- `link` does not modify or delete your original Skill directory.
- Credentials in Git URLs do not enter public catalogs.

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
