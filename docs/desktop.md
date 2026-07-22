# Skill Port Desktop

Skill Port Desktop is the local GUI for the same Hub managed by `sklp`.

## Development

Requirements are Node.js 24.15 or newer and Git for Git-based Skill installs.

```bash
npm install
npm run desktop:dev
```

Build or create an unsigned local package:

```bash
npm run desktop:build
npm run desktop:make
```

Verification:

```bash
npm run desktop:typecheck
npm run desktop:test
npm run desktop:e2e
```

The E2E command builds the production Vite bundles, then launches them through the Electron SDK because Playwright's Electron driver requires the Node inspector. Normal `desktop:build` and `desktop:make` outputs enable the security fuses declared in `apps/desktop/forge.config.ts`.

The first-run screen requires a project directory and optionally accepts a custom Hub directory. Existing CLI users open the active Hub resolved by `SKLP_HOME`, the Hub locator, or `~/.skill-port`.

The MVP supports Skill installation and linking, Hub-private tag editing from the Skill detail page, project/global enablement, read-only diagnostics, and safe removal. Enter tags separated by commas or new lines; clearing the field removes all tags. A Skill accepts up to 32 tags and each tag accepts up to 64 characters. Tag changes do not modify Skill files or public catalog output.

The Desktop does not include update management, repair, self-uninstallation, signing, notarization, or automatic application updates.
