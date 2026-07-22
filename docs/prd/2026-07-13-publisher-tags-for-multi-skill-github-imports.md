# PRD: Publisher tags for multi-Skill GitHub imports

## Problem Statement

Users can install a GitHub repository that expands into several Skills, but the Hub currently loses the shared publisher context after installation. Users cannot query all qualifying Skills published by one GitHub owner across multiple repositories. Catalogs deliberately omit source provenance, so publisher discovery must remain inside the Hub.

## Solution

When one GitHub URL installation resolves to at least two valid Skills, assign the GitHub owner as a Hub-only Publisher tag to every newly installed Skill in that operation. Users can filter installed Skills with `sklp list --tag <owner>`. The tag preserves the owner casing from the GitHub URL for display and matches case-insensitively. JSON Skill representations include `tags`; catalogs remain unchanged.

## User Stories

1. As a Skill Port user, I want every newly installed Skill from a qualifying multi-Skill GitHub import tagged with its GitHub publisher, so that I can find related Skills later.
2. As a Skill Port user, I want Skills from different qualifying repositories owned by `JimLiu` to share the `JimLiu` tag, so that I can browse the publisher's installed Skills together.
3. As a Skill Port user, I want `sklp list --tag JimLiu` to return only Skills tagged `JimLiu`, so that publisher discovery is precise.
4. As a Skill Port user, I want `sklp list --tag jimliu` and `sklp list --tag JIMLIU` to return the same Skills, so that query casing does not affect results.
5. As a Skill Port user, I want displayed tags to retain the GitHub owner's source casing, so that publisher names remain recognizable.
6. As a Skill Port user, I want the standard JSON representations of installed Skills to include their tags, so that automation can consume the same grouping information.
7. As a Skill Port user, I want catalog output to remain limited to its current public fields, so that local source provenance is not exposed through catalog artifacts.
8. As a Skill Port user, I want a one-Skill GitHub install to receive no automatic Publisher tag, so that the tag retains its meaning as a multi-Skill import grouping aid.
9. As a Skill Port user, I want local directories, `file://` Git repositories, and registry imports to receive no inferred Publisher tag, so that the Hub never guesses or reads Git configuration to determine ownership.
10. As a Skill Port user, I want browser-style GitHub tree URLs, HTTPS GitHub URLs, and SSH GitHub URLs to derive the same owner when they name the same publisher, so that supported GitHub URL forms behave consistently.
11. As a Skill Port user, I want an invalid sibling in an import not to prevent valid Skills from being tagged when at least two valid Skills remain, so that tagging follows the final valid install set.
12. As a Skill Port user, I want `--skip-existing` to leave the tags of existing Skills unchanged, so that repeated imports do not silently rewrite prior provenance.
13. As a Skill Port user, I want `update` to preserve my Skill's existing tags, so that updating content never changes grouping membership.
14. As a Skill Port user, I want a failed or rolled-back installation to leave no Publisher tags behind, so that Hub state stays transactional.
15. As a Skill Port user, I want existing Hub data to migrate safely when Publisher tags are introduced, so that upgrades retain all installed Skills and enablements.
16. As a Skill Port user, I want existing globally unique Skill names and opaque UUID instance IDs to remain unchanged, so that Publisher tags do not alter identity or name-conflict behavior.

## Implementation Decisions

- Introduce Publisher tags as Hub state associated with Skills. A Publisher tag is a Hub-only label and uses the domain terminology in `CONTEXT.md`.
- Add a backward-compatible persistent schema migration for Skill-to-tag associations. Tags must survive restart, read-only commands, recovery, removal, and update workflows.
- Derive an owner only from supported GitHub URL inputs. Do not inspect local Git configuration, remote configuration, filesystem paths, or registry metadata to infer an owner.
- Determine whether to apply the tag after source expansion and metadata validation. Apply it only when the resulting install plan contains at least two valid new Skills from that GitHub URL operation.
- Store and display the owner exactly as supplied by the GitHub URL; use case-insensitive equality for tag lookup and uniqueness.
- Add `--tag <owner>` to `list`. With the option, return only Skills carrying that Publisher tag; without it, preserve the existing complete-list behavior.
- Add `tags` to public JSON Skill representations returned by list, install, link, update, and info where a Skill representation is already emitted. A Skill with no tags returns an empty array.
- Preserve current catalog JSON, catalog Markdown, and copied-Skill `meta.json` shapes. Publisher tags are intentionally excluded from each artifact.
- CLI content workflows keep tags immutable: `update`, `--skip-existing`, and link do not add, replace, or remove Publisher tags. The Desktop follow-up may explicitly replace the same Hub-only tag set through its `updateTags` facade; removing a Skill still removes associated tags.
- Keep the existing UUID `instanceId` and global Skill-name uniqueness. Do not derive IDs from repository and Skill names, and do not add hash-based duplicate-name resolution in this feature.
- Preserve current rollback and recovery guarantees. Installation failures must not leave tag rows without their Skill, and recovery must not change existing tags.

## Testing Decisions

- Use one high-level CLI seam: black-box command tests that execute the built CLI through the existing test helper. Tests assert user-visible output and persisted behavior rather than database implementation details.
- Add GitHub multi-Skill import fixtures covering HTTPS, SSH, and browser tree URL forms. Assert tags are assigned only when the final valid candidate set contains at least two Skills.
- Assert `list --tag` filters correctly and case-insensitively in both human-readable and JSON output, while unfiltered list behavior remains intact.
- Assert JSON Skill representations expose `tags`, including an empty array for untagged Skills; update existing JSON-contract expectations accordingly.
- Assert catalog artifacts retain their current exact shape and omit tags after a tagged import.
- Assert a single-Skill GitHub import, local path, `file://` source, and registry import receive no inferred Publisher tag.
- Assert `update` and a skipped duplicate import preserve existing tags; assert remove cleans associated tags; assert failed and recovered installs leave no orphaned tag state.
- Reuse the existing Git-source, registry-source, JSON-output, lifecycle, recovery, and security test conventions. Run lint, typecheck, and the targeted CLI test files after building.

## Out of Scope

- Repository-specific tags such as `baoyu-skills`.
- Automatically inferred tags for non-GitHub, local, `file://`, or registry sources.
- Multiple tag categories or tag editing through the CLI. Desktop user-defined tag editing is specified by the Desktop GUI PRD.
- Exposing tags in catalog artifacts or copied-Skill metadata.
- Changing Skill `instanceId`, deriving IDs from repository and Skill names, or accepting duplicate Skill names through hash suffixes.
- Discovering and installing newly added Skills during `update`.
- Retagging an existing Skill during `update` or a skipped duplicate import.

## Further Notes

- This PRD adopts ADR 0001: Publisher tags are Hub-only to preserve catalog privacy and schema stability.
- The existing `list` command is the only new user-facing query surface required for this feature.
- The current `gh` status output reported invalid stored credentials; Issue creation is the authoritative verification of whether publication can proceed.
