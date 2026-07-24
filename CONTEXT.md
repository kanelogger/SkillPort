# Skill Port

Skill Port manages a local Hub of Agent Skills and their project or global enablements.

## Language

**CLI business closure**:
The state in which the advertised Skill Port CLI command contract has current, reproducible evidence on every supported platform, including Windows. It covers the complete local-Skill lifecycle, packaged install, CLI self-uninstallation, and supported runtime prerequisites; public npm publication is a separate publisher-owned distribution action.
_Avoid_: npm publication, feature completeness, test green

**CLI self-uninstallation**:
An interactive lifecycle command for the npm-globally-installed `skill-port-cli` package. `sklp uninstall` asks for confirmation and proceeds only when the user enters `y`; it removes the verified bundled Agent integration, Skill Port's Hub-recorded Agent entries, Hub (including managed Skills, state, and catalogs), Hub locator, and global npm package. The same command contract applies on macOS, Linux, and Windows. Hub-external linked Skill source folders, conflicting unmanaged entries, and the source checkout remain untouched.
_Avoid_: extra modes, filesystem scans, Hub preservation, desktop uninstallation

**Verified Skill Port resource**:
A filesystem object whose Skill Port ownership is established either by Hub state plus managed-path invariants, or by the bundled Agent integration resolving to the current npm package's canonical Skill directory. Only verified resources may be removed.
_Avoid_: manually managed Agent entry, Hub-external linked source, unverified file

**Bundled Agent integration**:
The package-owned `skill-port` management Skill registered at `~/.agents/skills/skill-port` by an npm-global install or `sklp agent setup`. It teaches compatible Agents to use `sklp` without modifying `AGENTS.md`. It is separate from Hub state and is owned only while the entry resolves to the current package's bundled Skill directory.
_Avoid_: global Hub enablement, persistent Agent instructions, unmanaged same-name entry

**Uninstall discovery boundary**:
CLI self-uninstallation checks the deterministic bundled Agent integration path and removes managed Agent entries recorded in Hub state. It does not scan the filesystem for additional entries.
_Avoid_: Home-wide search, implicit project discovery, recovery modes

**Node-only base runtime**:
A supported CLI environment using Node.js 22.16.0 or newer and npm, with no native build tool. CLI business closure requires the complete local-Skill lifecycle to work in this environment on every advertised platform, including Windows. The Desktop development and packaging toolchain remains on Node.js 24.15.0 or newer. Git-source commands preserve their full contract but require a separately installed system Git executable and fail before mutation with installation guidance when it is absent.
_Avoid_: universal Node-only runtime, hidden Git prerequisite

**Windows native business evidence**:
A successful GitHub Actions `windows-latest` run for the candidate, covering install, lint, typecheck, tests, platform tests, Agent discovery smoke, and packed CLI install smoke. Local Windows machines may reproduce failures, but they are not required when hosted Windows CI is green.
_Avoid_: Windows simulation, best-effort Windows support

**Published CLI release**:
A Skill Port CLI version that is available from the public npm registry as `skill-port-cli` and installs the `sklp` executable through npm. Publication is owned by the publisher; local tarball validation and cross-platform CI establish business closure but do not themselves make a version publicly available.
_Avoid_: business closure, local package smoke, unpublished release candidate

**CLI business closure patch**:
A patch release whose scope is limited to closing the CLI business loop: release evidence, verification documents, cross-platform CI, packaging fixes, and source fixes only for bugs that block the advertised CLI contract. It excludes npm publishing automation, new user-facing features, command semantics changes, and unrelated product enhancements.
_Avoid_: feature patch, opportunistic release

**Cross-platform business gate**:
A candidate gate that requires local checks plus a successful GitHub Actions CI run on macOS, Linux, and Windows. Windows support cannot be closed by macOS-only local evidence.
_Avoid_: local-only proof, post-facto CI

**Post-publish install smoke**:
A publisher-owned distribution verification run after npm publication that installs the exact published `skill-port-cli` version from the public npm registry, verifies the `sklp` executable, and exercises the local Skill lifecycle. It is manually runnable for a specified version on macOS, Linux, and Windows, and does not block CLI business closure.
_Avoid_: business gate, tarball smoke, local workspace execution

**Publisher tag**:
A Hub-only label naming the GitHub owner of a multi-Skill Git import. It is assigned only when a GitHub URL install yields at least two valid Skills, groups qualifying Skills from every repository of that owner, and is not catalog metadata or source provenance exposed outside the Hub. It preserves the owner's source casing for display and matches case-insensitively in Hub queries.
_Avoid_: repository tag, collection tag, category
