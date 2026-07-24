# Supported Skill Targets

Skill Port has one global target:

| Target | Global directory |
| --- | --- |
| Shared Agent directory | `~/.agents/skills/` |

Use `sklp enable <skill> --global` or `sklp disable <skill> --global`. Project enablement uses `<project>/.agents/skills/`.

Existing records for retired global Agent directories are never removed automatically. `sklp remove <skill> --force` and `sklp unlink <skill> --force` remove only verified managed entries while cleaning up a Skill.

macOS and Linux use directory symlinks. Windows first attempts a directory symlink and falls back to a junction.

## Bundled Agent integration

The npm-global package reserves `~/.agents/skills/skill-port` for its bundled management Skill. A global install registers that exact entry automatically; `sklp agent setup` provides an idempotent fallback when npm lifecycle scripts are disabled. Registration never writes `AGENTS.md` and refuses to overwrite an existing unmanaged entry.

This bootstrap entry is separate from Hub enablements. Ownership is verified by resolving the entry to the bundled `agent-skill/skill-port` directory in the installed npm package. Uninstall removes only that verified link or junction and does not scan the Agent directory.
