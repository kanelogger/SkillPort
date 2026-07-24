# Global install bootstraps Agent integration

An npm-global `skill-port-cli` install registers a bundled `skill-port` management Skill at `~/.agents/skills/skill-port`. This lets compatible Agents discover the `sklp` CLI in a new session without adding persistent instructions to a user's `AGENTS.md`.

The bootstrap entry is a special package integration, not a Hub-installed Skill or enablement. Its ownership is verified only when the entry resolves to the current package's bundled `agent-skill/skill-port` directory. Setup is idempotent, never overwrites a conflicting file, directory, link, or junction, and is available explicitly through `sklp agent setup` when npm lifecycle scripts are disabled or automatic setup cannot complete.

Only npm-global installation runs automatic setup. Source and local dependency installation do not modify the user's shared Agent directory. `sklp doctor` reports a missing integration as a warning and a conflicting reserved entry as an error without changing either state.

`sklp uninstall` and the npm global uninstall lifecycle remove the bootstrap entry only after verifying that exact ownership invariant. Cleanup checks the deterministic reserved path and does not scan the user's Home or Agent directories. A conflicting or replaced entry is preserved and reported.
