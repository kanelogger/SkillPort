# Supported Skill Targets

| Tool key | Global directory |
| --- | --- |
| `claude` | `~/.claude/skills/` |
| `codex` | `~/.codex/skills/` |
| `cursor` | `~/.cursor/skills/` |
| `agents` | `~/.agents/skills/` |
| `pi` | `~/.pi/agent/skills/` |
| `opencode` | `~/.config/opencode/skills/` |
| `trae` | `~/.trae/skills/` |
| `trae-cn` | `~/.trae-cn/skills/` |

OpenCode uses an existing `~/.opencode/skills/` directory only when the primary directory does not exist. When neither exists, Skill Port creates the primary directory.

Project enablement uses `<project>/.agents/skills/`.

macOS and Linux use directory symlinks. Windows first attempts a directory symlink and falls back to a junction.
