# Supported Skill Targets

Skill Port has one global target:

| Target | Global directory |
| --- | --- |
| Shared Agent directory | `~/.agents/skills/` |

Use `sklp enable <skill> --global` or `sklp disable <skill> --global`. Project enablement uses `<project>/.agents/skills/`.

Existing records for retired global Agent directories are never removed automatically. `sklp remove <skill> --force` and `sklp unlink <skill> --force` remove only verified managed entries while cleaning up a Skill.

macOS and Linux use directory symlinks. Windows first attempts a directory symlink and falls back to a junction.

## Bundled Agent integration

The npm-global package reserves these paths for bundled Skills:

| Bundled Skill | Reserved entry | Package source |
| --- | --- | --- |
| `skill-port` | `~/.agents/skills/skill-port` | `agent-skill/skill-port` |
| `skill-port-report` | `~/.agents/skills/skill-port-report` | `agent-skill/skill-port-report` |

A global install registers every reserved entry automatically; `sklp agent setup` provides an idempotent fallback when npm lifecycle scripts are disabled. Registration never writes `AGENTS.md` and refuses to overwrite an existing unmanaged entry at any reserved path.

These bootstrap entries are separate from Hub enablements. Ownership is verified by resolving each entry to the matching bundled directory in the installed npm package. Uninstall removes only verified links or junctions at those reserved paths and does not scan the Agent directory.
