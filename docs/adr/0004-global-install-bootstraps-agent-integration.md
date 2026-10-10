# Global install bootstraps Agent integration

An npm-global `skill-port-cli` install registers the package's bundled Agent Skills at reserved paths under `~/.agents/skills/`:

| Bundled Skill | Reserved entry |
| --- | --- |
| `skill-port` | `~/.agents/skills/skill-port` |
| `skill-port-report` | `~/.agents/skills/skill-port-report` |

`skill-port` teaches compatible Agents how to operate `sklp`. `skill-port-report` generates a private HTML inventory of Hub-installed Skills. Neither writes persistent instructions into a user's `AGENTS.md`.

Each bootstrap entry is a special package integration, not a Hub-installed Skill or enablement. Ownership is verified only when the entry resolves to the current package's matching bundled directory under `agent-skill/`. Setup is idempotent, never overwrites a conflicting file, directory, link, or junction, and is available explicitly through `sklp agent setup` when npm lifecycle scripts are disabled or automatic setup cannot complete. Setup registers every bundled entry in one pass and refuses the whole pass when any reserved path is occupied by unmanaged content.

Only npm-global installation runs automatic setup. Source and local dependency installation do not modify the user's shared Agent directory. `sklp doctor` reports each missing integration as a warning and each conflicting reserved entry as an error without changing either state.

`sklp uninstall` and the npm global uninstall lifecycle remove each bootstrap entry only after verifying that exact ownership invariant. Owned entries are removed even when another reserved path conflicts; conflicting or replaced entries are preserved and reported. Cleanup checks the deterministic reserved paths and does not scan the user's Home or Agent directories.
