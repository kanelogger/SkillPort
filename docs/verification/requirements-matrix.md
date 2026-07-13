# Skill Port CLI Requirements Matrix

Date: 2026-07-09

Status keys:

- `Passed`: implemented and verified against current local evidence.
- `Partial`: implemented or mostly verified, but the required evidence scope is wider than current proof.
- `External`: blocked on an external runner, installed Agent, GitHub state, or npm registry access.

| Requirement | Current evidence | Status |
| --- | --- | --- |
| R1 npm package exposes `sklp` on macOS, Linux, Windows | `package.json` bin; latest macOS and Linux packed installs passed; Windows native package smoke pending | Partial |
| R2 default/custom Hub | `tests/config.test.js`; `SKLP_HOME`; `sklp init --hub` | Passed |
| R3 init creates local Hub/SQLite and registers project without project manifest | core lifecycle tests; no project-owned Skill Port manifest implemented | Passed |
| R4 nearest registered ancestor only, no Git/language marker inference | nested project test; source search shows no Git marker discovery | Passed |
| R5 local, linked local, and Git Skill roots with `SKILL.md` | local lifecycle tests; linked local lifecycle test; `tests/git-source.test.js` covers Git roots, Git subdirectory installs with `--path`, subdirectory update, GitHub HTTPS/SSH/tree URLs, multi-Skill Git path scanning and Publisher tags including valid siblings beside invalid metadata, dry-run failed entries, disabled terminal prompts, and timeout handling | Passed |
| R6 strict `name`/`description` frontmatter with no partial state | invalid metadata and catalog rollback tests; invalid name errors include a suggested lowercase kebab-case name when one can be derived | Passed |
| R7 `instanceId` lifecycle | reinstall and update identity tests | Passed |
| R8 unique normalized names, user changes incoming `SKILL.md` | duplicate install test and error assertion | Passed |
| R9 no install-time alias/rename | command surface test | Passed |
| R10 local source/ref/revision/timestamps through `info` | Git install test; `info` JSON includes source fields | Passed |
| R11 no externally visible split state after install/link/update/catalog failures; recovery after interruption | publication rollback tests; linked local lifecycle test; interrupted copied and linked update recovery tests; startup recovery via `list/info` | Passed |
| R12 update name change fails | lifecycle update rename test | Passed |
| R13 copied installed Skills have `meta.json` limited to identity fields | catalog/core tests; doctor meta drift tests; linked local lifecycle test verifies source is not modified | Passed |
| R14 `catalog.json` schema and limited fields | catalog field tests | Passed |
| R15 `catalog.md` lists names/descriptions | catalog drift tests | Passed |
| R16 catalogs refresh after install/link/update/remove/unlink | lifecycle and rollback tests; linked local lifecycle test | Passed |
| R17 catalogs exclude project/source/private state | catalog field tests; package/core flow | Passed |
| R18 no manual catalog command | command surface test | Passed |
| R19 current project enablement to `.agents/skills` | core lifecycle test | Passed |
| R20 project disable removes managed entry only | core lifecycle test | Passed |
| R21 explicit initialized project target | explicit project test | Passed |
| R22 repeated enable/disable idempotent | global/project lifecycle tests | Passed |
| R23 global enable/disable syntax | global lifecycle tests cover the `--global` flag | Passed |
| R24 global target names fail before mutation | global validation test | Passed |
| R25 one canonical global target | global lifecycle test records the `agents` key only | Passed |
| R26 global target path is `~/.agents/skills/` | target registry test; discovery contract smoke test | Passed |
| R27 Unix symlink; Windows symlink then junction fallback | macOS/Linux native tests; simulated Windows symlink/junction adapter; native Windows pending | Partial |
| R28 actual entry path and link type recorded | `info` assertions; link adapter tests; Windows native link type pending | Partial |
| R29 enable verifies entry resolves to Hub content and has `SKILL.md` | lifecycle, conflict, discovery contract tests | Passed |
| R30 unmanaged files/directories/links are not overwritten or adopted | target conflict tests; unregistered Hub destination test; unregistered Hub link test | Passed |
| R31 update preserves active enablements | update active link test | Passed |
| R32 disable removes only matching managed entry | core lifecycle, force remove, conflict tests | Passed |
| R33 remove refuses active enablements and lists blockers | core lifecycle remove refusal | Passed |
| R34 forced remove disables managed targets first | force remove and interrupted forced removal recovery tests | Passed |
| R35 doctor checks Hub, DB, content, meta, catalogs, projects, entries, links, types, drift | doctor tests for removed links, metadata, invalid catalog, read-only DB, corrupt DB, missing Hub skills, link type, target record, orphan entries, operations | Passed |
| R36 doctor is read-only and actionable | read-only SQLite hash test; drift tests preserve files | Passed |
| R37 list shows installed names/descriptions | core lifecycle test | Passed |
| R38 info shows identity/source/timestamps/enablements/health | global lifecycle and health drift tests | Passed |
| R39 failed mutations exit nonzero and preserve valid state | install/update/remove/catalog/target conflict tests | Passed |
| R40 project enablement does not inspect or modify Git config | source search and absence of Git config access in runtime code | Passed |
| R41 routine output/catalogs avoid credential and unrelated path leaks | HTTP(S) and SSH URL redaction tests; catalog privacy tests | Passed |
| R42 `sklp link <path>` registers an actively edited local Skill without copying or modifying the source directory | linked local lifecycle test verifies catalog/list visibility, project enablement, live source edits, and no source `meta.json` write | Passed |
| R43 `sklp unlink <skill>` removes only linked local registrations and preserves the source directory | linked local lifecycle test verifies active enablement refusal, `--force`, catalog cleanup, Hub entry removal, and source preservation | Passed |
| R44 `sklp install <sources.json>` expands registry `local_path` entries into concrete Skill directories | registry source tests cover direct `local_path/SKILL.md`, fallback scan of `local_path/**/SKILL.md`, parent-relative warehouse paths, empty source failure, non-mutating `--dry-run`, duplicate-name preflight, already-installed preflight, and `--skip-existing` | Passed |
| R45 core automation commands expose machine-readable JSON | JSON output test covers successful `install/list/enable/doctor`, `info` default JSON, and stable `--json` runtime error envelopes | Passed |
| R46 Chinese users have first-party onboarding documentation | `README.zh-CN.md` covers install, registry import, link, enablement, JSON output, privacy, diagnostics, and safety boundaries | Passed |
| R47 Chinese users can opt into Chinese human-readable CLI output | Chinese output test covers `SKLP_LANG=zh-CN` for command help, `init`, `install`, `enable`, and `doctor`; JSON output remains stable in Chinese mode | Passed |
| R48 doctor diagnostics include actionable suggestions | JSON output test checks diagnostic `suggestion`; Chinese output test checks human-readable `建议:` output for doctor drift | Passed |
| R49 exit codes are documented for scripts and Agents | `docs/exit-codes.md` documents command failure semantics, doctor warning/error behavior, JSON automation fields, and Chinese notes; existing tests cover success, warning-only doctor, and error doctor statuses | Passed |
| R50 single Git Skill update checks are read-only and report stable tracking status | `tests/git-source.test.js` covers default branch, named branch, commit pin, stored source tracking, and Hub state snapshots; README and exit-code docs define the contract | Passed |
| R51 fleet Git update checks, previews, and batch updates are deterministic and isolated | `tests/batch-update.test.js` covers name order, local/linked/tag skips, Chinese human output, JSON contracts, immutable Hub/managed-entry snapshots, resolved revisions, partial failure continuation, and preserved enablements; README and exit-code docs define the contract | Passed |

## External Release Gates

| Gate | Evidence needed | Status |
| --- | --- | --- |
| Windows native support | GitHub Actions or another native Windows runner must pass `npm ci`, lint, typecheck, tests, `test:platform`, `test:discovery`, and packed install | External |
| Shared-directory runtime loading | An Agent consuming `~/.agents/skills/` must load the smoke Skill from the advertised directory | External |
| Latest packed install | Latest macOS and Linux clean-prefix tarball installs passed | Passed |
| Dependency audit | `npm audit --omit=dev` completed with 0 vulnerabilities | Passed |
| GitHub CI | `gh` auth or a pushed branch is required to observe real workflow results | External |
