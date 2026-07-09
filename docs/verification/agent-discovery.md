# Agent Discovery Verification

This file records the release evidence for Skill Port's advertised targets.

## Automated contract

The target registry and packaged CLI smoke tests run with an isolated synthetic home directory. They verify every target path, managed entry, `SKILL.md` visibility, and enable/disable lifecycle without modifying a developer's real Agent configuration.

Latest local contract run:

- Date: 2026-07-09
- Runtime: Node.js 24.15.0 on macOS and Linux (Debian Bookworm container)
- Result: all 8 target keys passed on both runtimes
- Command: `npm run test:discovery`

Real runtime smoke tests used an isolated project and the `skill-port-discovery-smoke` fixture. Both Agents returned the fixture's exact `SKILL_PORT_DISCOVERY_OK` response. Each managed entry was then removed through `sklp disable`, and a filesystem check confirmed no entry remained.

## Release evidence

Before publishing a release, record the date, Agent version, operating system, command target, and observed Skill discovery result for each advertised tool.

| Tool | Date | Version | OS | Result |
| --- | --- | --- | --- | --- |
| Claude Code | Pending release candidate | Pending | Pending | Pending |
| Codex | 2026-07-09 | 0.142.5 | macOS | Passed |
| Cursor | Pending release candidate | Pending | Pending | Pending |
| Agents-compatible tools | Pending release candidate | Pending | Pending | Pending |
| Pi | 2026-07-09 | 0.80.3 | macOS | Passed |
| OpenCode | Pending release candidate | Pending | Pending | Pending |
| Trae | Pending release candidate | Pending | Pending | Pending |
| Trae CN | Pending release candidate | Pending | Pending | Pending |
