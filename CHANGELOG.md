# Changelog

## 0.9.2 - 2026-08-01

### Changes

- 更新新增同步远程，如果远程有新增技能把新技能下载下来

## 0.9.1 - 2026-08-01

### Changes

- Add atomic batch Skill tagging with CLI and Desktop interoperability

## 0.9.0 - 2026-08-01

### Changes

- 批量更新tag

## 0.8.0 - 2026-07-30

### Changes

- 更新点无关紧要的命令

## 0.7.0 - 2026-07-30

### Changes

- update

## 0.6.0 - 2026-07-24

### Changes

- 兼容 node 22

## Unreleased

### Features

- Add source-aware `sklp sync` reconciliation for Git collections, including read-only previews, fleet sync, additions, updates, missing-state tracking, and explicit safe pruning.
- Let Desktop users preview and synchronize every registered Git source collection, with default retention and separately confirmed pruning of enabled missing Skills.
- Add atomic `sklp tag add <tag> <skills...>` batch tagging with read-only preview, JSON output, case-insensitive matching, and shared CLI/Desktop Hub visibility.
- Bundle a compact `skill-port` management Skill and register it during npm-global installation so compatible Agents can discover `sklp` without changes to `AGENTS.md`.
- Add the idempotent `sklp agent setup` recovery command and read-only doctor diagnostics for missing or conflicting Agent integration state.
- Support the CLI on Node.js 22.16 or newer while preserving stderr-free JSON output on Node 22.
- Add `sklp update [skill|--all] --ref <ref>` to move pinned Git Skills to an explicit branch, tag, or commit.
- Let Desktop users preview and move one or all pinned Git Skills to an explicit branch, tag, or commit.
- Add `sklp list --status` for path-free installation, enablement, and health summaries.
- Add read-only `sklp prune --dry-run --json` previews and confirmed `sklp prune --yes` cleanup for verified unused copies.
- Add `sklp export [output]` for a self-contained, offline-searchable, privacy-limited static Skill catalog.
- Let Desktop users export the same localized static catalog through a system save dialog.

### Documentation

- 更新内置 `skill-port` 管理 Skill，覆盖 registry 安装、批量标签、Agent 集成、批量更新与 Git collection sync 的当前命令和安全边界；新增 `skill-up` 回归用例，并以构建后递归 help 指纹在测试和 `prepack` 阶段阻止 CLI 命令面与 bundled Skill 漂移。

### Fixes

- Stop reporting a successful update when a Git Skill is pinned to its existing tag or commit.
- Reuse remote checks and Git clones by repository/ref during batch updates instead of repeating them for every Skill.
- Carry Desktop tracking refs through the validated RPC bridge and require a successful ref-aware preview before confirmation.
- Make Desktop Skill health reuse the CLI status calculation for missing content, metadata drift, linked-source drift, and enablement conflicts.
- Package the Desktop utility worker as a dedicated ESM bundle so it neither overwrites the main-process bundle nor rejects the core's top-level SQLite import.
- Give every published-package install retry a fresh npm cache and prefer online metadata so an initial propagation miss cannot poison later attempts.

### Safety

- Keep upstream-missing Skills by default, require `--prune` for removal, protect enabled entries unless `--force` is explicit, and never infer deletion from invalid upstream metadata.
- Refuse to overwrite or remove an unverified `~/.agents/skills/skill-port` entry, and clean up only the package-owned integration during CLI or npm-global uninstallation.
- Preserve linked Skills and unverified copies during bulk prune operations.
- Preserve existing static catalog outputs unless export is explicitly run with `--force`, and exclude private Hub/source state from the page.
- Authorize Desktop exports only for the exact file selected through the system save dialog.

## 0.5.1 - 2026-07-22

### Changes

- update uninstall

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
