# Agent Discovery Verification

This file records the release evidence for Skill Port's advertised targets.

## Automated contract

The target registry and packaged CLI smoke tests run with an isolated synthetic home directory. They verify the shared Agent directory path, managed entry, `SKILL.md` visibility, and enable/disable lifecycle without modifying a developer's real Agent configuration.

Latest local contract run:

- Date: 2026-07-13
- Runtime: Node.js 24.15.0 on macOS
- Result: the shared Agent target contract passed
- Command: `npm run test:discovery`

The 2026-07-09 Codex runtime smoke test used an isolated project and the `skill-port-discovery-smoke` fixture. It returned the fixture's exact `SKILL_PORT_DISCOVERY_OK` response. The managed entry was then removed through `sklp disable`, and a filesystem check confirmed no entry remained.

## Release evidence

Before publishing a release, record runtime evidence only for an Agent whose discovery behavior is explicitly advertised. Skill Port itself advertises the shared directory, not tool-specific integrations.

| Shared directory consumer | Date | Version | OS | Result |
| --- | --- | --- | --- | --- |
| Codex | 2026-07-09 | 0.142.5 | macOS | Passed |
