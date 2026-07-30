---
name: skill-port
description: Manage local Agent Skills through the sklp CLI. Use when the user asks to initialize a Skill Port Hub; install, link, list, inspect, enable, disable, update, diagnose, export, prune, remove, or unlink Skills; manage project or global Skill availability; or uninstall Skill Port managed state.
---

# Skill Port

Use `sklp` for the Agent Skill lifecycle. Do not edit the Hub, `.agents/skills/`, or `~/.agents/skills/` by hand.

1. Determine the requested action and target. Run `sklp <command> --help` before constructing an unfamiliar command.
2. Prefer `--json` for machine-readable results. Use available `--dry-run` or `--check` options before mutations when they answer the request. Use `sklp list --status --json` for installation, enablement, and health summaries. Use `sklp export [output] --json` for a self-contained public catalog.
3. Run project-scoped operations from the project root or pass `--project <path>`. Use `--global` only when the user asks for global availability.
4. Do not infer authorization for mutations from an inspection or diagnostic request. Preview cleanup with `sklp prune --dry-run --json`; use `sklp prune --yes`, `--force`, or `sklp uninstall` only when explicitly requested.
5. Verify mutations with the relevant read command. Use `sklp doctor --json` for read-only health diagnostics.
6. Static exports contain only names and descriptions. Preserve an existing output unless the user explicitly authorizes `sklp export <output> --force`.
