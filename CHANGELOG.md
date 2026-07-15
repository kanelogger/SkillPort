# Changelog

## 0.5.0 - 2026-07-15

### Features

- Add interactive `sklp uninstall`, which accepts only an exact lowercase `y`, removes Skill Port-managed entries, Hub state, locator, and the npm-global CLI, and preserves Hub-external linked sources.

### Release

- Publish GitHub Releases to npm through GitHub OIDC trusted publishing and verify the exact published package on macOS, Linux, and Windows, including self-uninstallation.

## 0.4.1 - 2026-07-14

### Release

- Add a manually rerunnable post-publish smoke workflow that installs the published npm package on macOS, Linux, and Windows and exercises the local Skill lifecycle.
- Document the CLI business-closure evidence for Node.js 24.15.0/npm users, including Windows CI evidence and publisher-owned published-package smoke verification.

## 0.4.0 - 2026-07-13

### Features

- Add Hub-only Publisher tags for GitHub multi-Skill imports and case-insensitive `sklp list --tag <owner>` filtering.
- Continue multi-Skill Git imports when invalid sibling metadata is present, while preserving valid Skills and their Publisher tags.

### Documentation

- Document Publisher tag privacy and Git import behavior in English and Chinese guides.

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
