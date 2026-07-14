# Skill Port

Skill Port manages a local Hub of Agent Skills and their project or global enablements.

## Language

**CLI business closure**:
The state in which the advertised Skill Port CLI command contract has current, reproducible evidence on every supported platform, including Windows. It covers the complete local-Skill lifecycle, packaged install, and supported runtime prerequisites; public npm publication is a separate publisher-owned distribution action.
_Avoid_: npm publication, feature completeness, test green

**Node-only base runtime**:
A supported environment using Node.js 24.15.0 or newer and npm, with no native build tool. CLI business closure requires the complete local-Skill lifecycle to work in this environment on every advertised platform, including Windows. Git-source commands preserve their full contract but require a separately installed system Git executable and fail before mutation with installation guidance when it is absent.
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
