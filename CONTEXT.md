# Skill Port

Skill Port manages a local Hub of Agent Skills and their project or global enablements.

## Language

**CLI release closure**:
The state in which a specific Skill Port CLI version has satisfied its defined release gates with current, reproducible evidence on every advertised platform, including Windows. It excludes deferred product capabilities that are outside that version's published command contract.
_Avoid_: feature completeness, product closure, test green

**Node-only base runtime**:
A supported environment using Node.js 24.15.0 or newer and npm, with no native build tool. CLI release closure requires the complete local-Skill lifecycle to work in this environment on every advertised platform, including Windows. Git-source commands preserve their full contract but require a separately installed system Git executable and fail before mutation with installation guidance when it is absent.
_Avoid_: universal Node-only runtime, hidden Git prerequisite

**Windows native release evidence**:
A successful GitHub Actions `windows-latest` run for the release candidate, covering install, lint, typecheck, tests, platform tests, Agent discovery smoke, and packed CLI install smoke. Local Windows machines may reproduce failures, but they are not required when hosted Windows CI is green.
_Avoid_: Windows simulation, best-effort Windows support

**Published CLI release**:
A Skill Port CLI version that is available from the public npm registry as `skill-port-cli` and installs the `sklp` executable through npm. Local tarball validation, CI, and package dry runs qualify a release candidate but do not by themselves satisfy publication.
_Avoid_: local package smoke, unpublished release candidate

**CLI release closure patch**:
A patch release whose scope is limited to closing the CLI release loop: release evidence, verification documents, CI or publishing fixes, and source fixes only for bugs that block the advertised CLI contract. It excludes new user-facing features, command semantics changes, and unrelated product enhancements.
_Avoid_: feature patch, opportunistic release

**Pre-release platform gate**:
A release candidate gate that requires local release checks plus a successful GitHub Actions CI run on macOS, Linux, and Windows before tagging or creating the GitHub Release. Windows support cannot be closed by macOS-only local evidence.
_Avoid_: local-only release proof, post-facto CI

**Post-publish install smoke**:
A release gate run after npm publication that installs the exact published `skill-port-cli` version from the public npm registry, verifies the `sklp` executable, and exercises the local Skill lifecycle. Windows must pass this smoke for CLI release closure; macOS and Linux should pass for full platform confidence. It should run automatically after successful publication and remain manually rerunnable for a specified version.
_Avoid_: tarball smoke, local workspace execution

**Publisher tag**:
A Hub-only label naming the GitHub owner of a multi-Skill Git import. It is assigned only when a GitHub URL install yields at least two valid Skills, groups qualifying Skills from every repository of that owner, and is not catalog metadata or source provenance exposed outside the Hub. It preserves the owner's source casing for display and matches case-insensitively in Hub queries.
_Avoid_: repository tag, collection tag, category
