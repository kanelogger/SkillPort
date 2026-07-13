# Changelog

## 0.3.0 - 2026-07-13

### Breaking Changes

- Replace named global Agent targets with one shared `~/.agents/skills/` target. Use `sklp enable <skill> --global` and `sklp disable <skill> --global` without a tool name.

### Documentation

- Document the canonical global target and the safe cleanup behavior for retired managed entries.

## 0.2.0 - 2026-07-13

### Features

- Add Git repository subdirectory installation, multi-Skill discovery, registry dry-run previews, non-interactive Git commands, and configurable Git command timeouts.
- Add read-only Git update checks for one Skill or the installed fleet, including stable JSON, bilingual output, pinned references, and safe `unknown` results.
- Add deterministic batch update previews and updates that use resolved revisions, preserve per-Skill recovery, and continue after individual failures.

### Documentation

- Document update checks, batch update behavior, exit codes, supported targets, and repository contributor workflows.
