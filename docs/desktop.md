# Skill Port Desktop

<p align="center">
  <img src="../apps/desktop/assets/skill-port-icon.png" alt="Skill Port application icon" width="128">
</p>

Skill Port Desktop is the local GUI for the same Hub managed by `sklp`.

## Install a release

Desktop 0.1.3 was withdrawn on July 23, 2026 because its macOS packages can exit immediately at launch. Do not install a cached `Skill.Port-0.1.3-*.dmg` or macOS ZIP. Until a replacement is published, install the CLI with `npm install --global skill-port-cli` and use `sklp`.

After a replacement appears on [GitHub Releases](https://github.com/kanelogger/SkillPort/releases), download the package for your system:

- macOS Apple Silicon: download the `arm64.dmg`, open it, and drag Skill Port to Applications.
- macOS Intel: download the `x64.dmg`, open it, and drag Skill Port to Applications.
- Windows: run `Skill Port Setup.exe`.

The macOS packages use an ad-hoc signature so Gatekeeper can verify that the application bundle was not modified after packaging. They are not Developer ID signed or notarized, so macOS may still block the first launch. Right-click Skill Port and choose **Open**; on newer macOS versions, launch it once, then open **System Settings > Privacy & Security** and choose **Open Anyway**. Windows may show a SmartScreen warning. `SHA256SUMS.txt` in each Desktop release contains installer checksums.

If the app exits immediately after Gatekeeper has allowed it, remove that version and install a newer release. Removing quarantine or locally re-signing a known-bad package is not a supported repair.

## First run

1. Choose the project directory where Skill Port should manage Agent Skill entries.
2. Keep the default Hub unless an existing CLI setup uses `SKLP_HOME`, a Hub locator, or another custom Hub.
3. Install a Skill from a local directory or Git source, or link a local Skill under active development.
4. Open the Skill detail page and enable it for the selected project or globally.
5. Use Diagnostics for read-only health checks. Review the preview before confirming any Git Skill update.

## Application icon

The shared application icon lives under `apps/desktop/assets/`. The PNG is used by the renderer and Linux window, the ICNS file is embedded in macOS packages, and the ICO file is embedded in Windows packages and the Squirrel installer.

## Development

Requirements are Node.js 24.15 or newer and Git for Git-based Skill installs.

```bash
npm install
npm run desktop:dev
```

Build or create a local package. macOS builds receive an ad-hoc signature:

```bash
npm run desktop:build
npm run desktop:make
```

Use the Desktop release script from a clean, synchronized `main` branch. It runs the local quality gates, updates the Desktop workspace version and lockfile, commits, creates the matching tag, and pushes it. GitHub Actions then builds the macOS and Windows installers, checksums them, and creates the GitHub Release.

```bash
npm run release:desktop -- patch
```

Use `minor`, `major`, or an exact stable version when appropriate. The script asks for final confirmation; use `--yes` only for an intentional non-interactive release. `--dry-run` validates the target without changing state. If a push fails after the commit and tag are created, fix the cause and run `npm run release:desktop -- --resume`.

Desktop tags use the `desktop-v*` prefix. CLI npm releases keep using `v*` tags.

Verification:

```bash
npm run desktop:typecheck
npm run desktop:test
npm run desktop:e2e
```

The E2E command builds the production Vite bundles, then launches them through the Electron SDK because Playwright's Electron driver requires the Node inspector. Normal `desktop:build` and `desktop:make` outputs enable the security fuses declared in `apps/desktop/forge.config.ts`.

The first-run screen requires a project directory and optionally accepts a custom Hub directory. Existing CLI users open the active Hub resolved by `SKLP_HOME`, the Hub locator, or `~/.skill-port`.

The MVP supports Skill installation and linking, Hub-private tag editing from the Skill detail page, project/global enablement, read-only diagnostics, safe removal, and manual Git Skill updates. The Desktop can check one copied Git Skill or the full Hub, show a non-mutating update preview, then update only after confirmation. Local copies, linked Skills, and tag/commit-pinned Git Skills remain skipped according to the CLI update contract. Enter tags separated by commas or new lines; clearing the field removes all tags. A Skill accepts up to 32 tags and each tag accepts up to 64 characters. Tag changes do not modify Skill files or public catalog output.

The Desktop does not include background update checks, repair, self-uninstallation, Developer ID signing, notarization, or automatic application updates.
