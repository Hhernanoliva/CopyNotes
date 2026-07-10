# CopyNotes — Instructions for Claude Code

- Read `AGENT.md` before any work. It is the source of truth for product direction, architecture, and quality bar.
- Before implementing a meaningful feature, read the relevant spec in `specs/` (index in `specs/README.md`).
- Build order and slices: `specs/017-mvp-implementation-plan.md`.
- Explain decisions to Hernan in plain Spanish; he is not an engineer.

## Design Tokens: Quiet Ink → shadcn-svelte

The Quiet Ink token names in `specs/016-design-system.md` (`surface`, `text-muted`, `accent`, `danger`, ...) are the conceptual palette. In code, load their values into shadcn-svelte's CSS variable convention (`background`, `card`, `primary`, `muted-foreground`, `destructive`, ...), because shadcn-svelte components are pre-wired to those names. Do not rename component tokens to match spec 016; do not hard-code raw colors either way. When spec 016 has no shadcn equivalent (e.g. `text-faint`), add a custom CSS variable following the same convention.

## TypeScript vs Plain JavaScript

TypeScript tooling is enabled project-wide (spec 001). Generated or vendored code — shadcn-svelte components added via CLI — keeps its TypeScript annotations untouched. Hand-written project code is plain JavaScript style inside `.ts`/`.svelte` files: no type annotations unless Hernan asks.

## UI/UX Stage Flow Status

Hernan's global 4-stage UI flow applies, but Stage 1 (design system) is already completed and approved: the output is `specs/016-design-system.md` (Quiet Ink, approved 2026-07-09). Do not regenerate the design system. UI work starts at Stage 2 (taste/polish) or Stage 3 (build), per the global flow rules.
