# 013 - Testing, Release And Quality Bar

## Objective

Define what “done” means for CopyNotes features. The goal is not to test everything, but to protect the flows that could break writing, local data, copying, backup, or future extensibility.

## What Enters

- Vitest as main test layer.
- Testing Library for key Svelte components.
- Playwright for critical user flows.
- Manual QA checklist. → `docs/release-checklist.md`
- Release readiness checklist. → `docs/release-checklist.md`
- Documentation/spec update requirement.
- Regression protection for high-risk areas.

## What Does NOT Enter

- No excessive snapshot testing.
- No visual perfection tests in MVP.
- No full browser matrix in early MVP.
- No CI complexity that slows development too much before product validation.

## Model Of Data Affected

Quality checks must especially protect:

- notes
- blocks and hierarchy
- local storage
- import/export
- snippets
- tags/search
- settings/theme
- future sync and MCP seams

## Critical User Flows

Playwright or manual critical flows should cover:

- Create note.
- Write text block.
- Create nested bullets.
- Create todo and mark done.
- Collapse/expand nested block.
- Drag and drop reorder.
- Copy outline.
- Reload and verify local autosave.
- Create snippet from block.
- Insert snippet.
- Add tag and search by tag.
- Export backup.
- Import backup.
- Switch theme.
- Basic mobile layout.

## Acceptance Criteria

A feature is not done until:

- App runs without errors.
- Relevant Vitest tests pass.
- Key component tests exist where UI behavior is risky.
- Critical Playwright flow exists or manual check is documented.
- Docs/specs are updated.
- No unrelated feature was broken.
- Data-loss risks were considered.

## Minimum Tests

Always prefer Vitest for:

- block hierarchy
- reorder calculations
- copy formatters
- import/export validation
- storage repositories
- search helpers
- permission helpers when MCP comes later

Use Testing Library for:

- editor block behavior
- slash command menu
- backup/import dialogs
- snippet insertion
- tag controls

Use Playwright for:

- end-to-end writing and persistence
- backup roundtrip
- copy behavior where possible
- mobile/PWA smoke flows

## Agent Notes

Do not call a feature complete just because it appears on screen. It must survive reloads, preserve data, and respect the product decisions in `AGENT.md`.

## Convention Update (2026-07-11, Hernan's decision)

The project has NO component-test infrastructure: Testing Library was never added and stays out. The convention is pure Vitest for logic + Playwright for critical flows (e2e/ suite). Where this spec says "Testing Library", cover that behavior with a Playwright check or a pure-logic Vitest test instead.
