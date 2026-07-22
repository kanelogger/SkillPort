# Skill Port Desktop

<p align="center">
  <img src="../apps/desktop/assets/skill-port-icon.png" alt="Skill Port application icon" width="128">
</p>

Skill Port Desktop is the local GUI for the same Hub managed by `sklp`.

## Install a release

Download the package for your system from [GitHub Releases](https://github.com/kanelogger/SkillPort/releases):

- macOS Apple Silicon: download the `arm64.dmg`, open it, and drag Skill Port to Applications.
- macOS Intel: download the `x64.dmg`, open it, and drag Skill Port to Applications.
- Windows: run `Skill Port Setup.exe`.

These MVP packages are unsigned. On macOS, right-click Skill Port and choose **Open** on the first launch. Windows may show a SmartScreen warning. `SHA256SUMS.txt` in each Desktop release contains installer checksums.

## Application icon

The shared application icon lives under `apps/desktop/assets/`. The PNG is used by the renderer and Linux window, the ICNS file is embedded in macOS packages, and the ICO file is embedded in Windows packages and the Squirrel installer.

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

Pushing a tag matching the Desktop version creates the macOS and Windows GitHub Release. For version `0.1.1`:

```bash
git tag desktop-v0.1.1
git push origin desktop-v0.1.1
```

Desktop tags use the `desktop-v*` prefix. CLI npm releases keep using `v*` tags.

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
