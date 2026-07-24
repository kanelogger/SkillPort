# Agent Discovery Verification

This file records the release evidence for Skill Port's advertised targets.

## Automated contract

The target registry and packaged CLI smoke tests run with an isolated synthetic home directory. They verify the shared Agent directory path, managed entry, `SKILL.md` visibility, and enable/disable lifecycle without modifying a developer's real Agent configuration.

Latest local contract run:

- Date: 2026-07-13
- Runtime: Node.js 24.15.0 on macOS
- Result: the shared Agent target contract passed
- Command: `npm run test:discovery`

For v0.4.1 business closure, the same command passed in GitHub Actions CI run `29315513324` on macOS, Linux, and Windows. Windows hosted CI is the native Windows evidence source for the shared-directory contract.

The 2026-07-09 Codex runtime smoke test used an isolated project and the `skill-port-discovery-smoke` fixture. It returned the fixture's exact `SKILL_PORT_DISCOVERY_OK` response. The managed entry was then removed through `sklp disable`, and a filesystem check confirmed no entry remained.

## Bundled management Skill

The package smoke now verifies the bootstrap path used to teach Agents about `sklp`: an isolated npm-global install creates `~/.agents/skills/skill-port`, its `SKILL.md` is visible through the managed entry, and `sklp uninstall` removes the verified entry. The latest local run passed on 2026-07-24 with Node.js 24.15.0. `tests/agent-integration.test.js` separately covers explicit recovery, idempotence, unmanaged conflicts, and doctor behavior.

This proves packaging and shared-directory visibility. A running Agent may cache its Skill inventory, so discovery is promised for a new Agent session rather than immediate hot reload.

## Release evidence

Before publishing a release, record runtime evidence only for an Agent whose discovery behavior is explicitly advertised. Skill Port itself advertises the shared directory, not tool-specific integrations. The automated contract is therefore the business-closure gate; real Agent runtime smoke is supporting evidence, not a required gate for every Agent that happens to read `~/.agents/skills/`.

| Shared directory consumer | Date | Version | OS | Result |
| --- | --- | --- | --- | --- |
| Codex | 2026-07-09 | 0.142.5 | macOS | Passed |
