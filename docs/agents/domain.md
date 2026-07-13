# Domain Docs

How engineering skills should consume this repository's domain documentation when exploring the codebase.

## Layout

This is a single-context repository. Its shared domain vocabulary belongs in root `CONTEXT.md`; architectural decisions belong in `docs/adr/`.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

When these files do not exist, proceed silently. The `domain-modeling` skill creates them when terminology or an architectural decision is actually resolved.

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md` in issue titles, refactor proposals, hypotheses, and test names. When a required concept is absent, either reconsider the wording or record the gap for `domain-modeling`.

## Flag ADR conflicts

Explicitly surface a conflict with an existing ADR rather than silently overriding it.
