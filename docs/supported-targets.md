# Supported Skill Targets

Skill Port has one global target:

| Target | Global directory |
| --- | --- |
| Shared Agent directory | `~/.agents/skills/` |

Use `sklp enable <skill> --global` or `sklp disable <skill> --global`. Project enablement uses `<project>/.agents/skills/`.

Existing records for retired global Agent directories are never removed automatically. `sklp remove <skill> --force` and `sklp unlink <skill> --force` remove only verified managed entries while cleaning up a Skill.

macOS and Linux use directory symlinks. Windows first attempts a directory symlink and falls back to a junction.
