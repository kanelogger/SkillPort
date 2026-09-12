# Fix plan: make read-only CLI queries safe for protected Hub paths

Date: 2026-09-12
Status: local fix implemented; release follow-up pending

## Problem

`sklp list` and `sklp info` are read-only from a user’s perspective, but they opened the Hub database in the default read-write mode. `StateStore` then enabled WAL mode and ran migrations. In a restricted runner such as the Codex sandbox, `~/.skill-port/state.db` can be readable while its directory is not writable to the process. SQLite therefore returned error 14 (`unable to open database file`).

The database was verified separately: copying it to a writable temporary directory produced `PRAGMA integrity_check = ok`. `doctor` and update previews already worked because they open a temporary read-only snapshot.

## Implementation

1. Run `list` and `info` through a shared query helper that first uses the normal open path, preserving startup recovery on writable Hubs.
2. When opening or initializing the writable connection fails with a protected/read-only database error, retry through `{ recover: false, readOnly: true }` and the existing temporary snapshot mechanism.
3. Keep mutations (`init`, `install`, `enable`, `disable`, `remove`, `unlink`, confirmed updates and sync) on the existing read-write path.
4. Preserve JSON fields, human-readable output, exit codes, and the existing recovery semantics.
5. Add a regression test that makes a temporary Hub directory and database non-writable, then verifies `list --json` and `info` still succeed.

## Verification

Required local commands:

```sh
npm run build
npm run lint
npm run typecheck
node --test tests/core-loop.test.js
npm test
```

The focused regression must prove that the source database remains unchanged and that read-only commands do not create WAL, SHM, journal, or migration files beside it. A protected real Hub smoke check should also run the built CLI against `SKLP_HOME` when the host grants access to that directory.

## Release and compatibility

- No command names, flags, JSON fields, or mutation semantics change.
- The fix is compatible with existing schema versions and does not require rebuilding or migrating user databases.
- Update the changelog and requirements matrix with the read-only query behavior.
- Run the normal package, discovery, and cross-platform smoke suites before publishing the next CLI release.
