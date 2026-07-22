# Electron Desktop reuses the Skill Port core through isolated RPC

Skill Port Desktop uses Electron 43, React, TypeScript, Vite, and Electron Forge in `apps/desktop`.

The renderer is sandboxed with context isolation and no Node integration. A narrow preload API sends validated requests to the main process. The main process validates the sender and forwards requests to a serial Electron utility process. The utility process invokes the `DesktopSkillPort` application facade; it does not execute the CLI or parse stdout.

This preserves the existing Hub lock, SQLite transactions, operation journal, rollback, recovery, catalog privacy, and managed-entry ownership rules while keeping synchronous filesystem and Git work off the window thread. The CLI and Desktop remain separate products in one repository and share the same Hub schema.
