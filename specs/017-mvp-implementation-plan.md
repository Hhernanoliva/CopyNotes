# 017 - MVP Implementation Plan

## Objective

Define a practical, professional implementation plan for building the CopyNotes MVP in small, safe slices.

The goal is to avoid building everything at once. Each slice should leave the app in a better, runnable state and should protect the two most important workflows:

1. Write notes using bullets.
2. Copy individual bullets or text blocks quickly.

## Planning Principles

- Build the smallest useful version first.
- Keep the editor, storage, backup, snippets, tags, and search separated.
- Do not add sync, accounts, AI, MCP, or a rich editor framework in the MVP.
- Prefer working software over large unfinished areas.
- Protect user text above all else.
- Treat backup/import as a trust feature, not an optional extra.
- Keep the design system swappable through tokens and shared components.
- Add tests around risky logic as soon as that logic exists.

## What Enters

- SvelteKit project setup.
- Tailwind and shadcn-svelte foundation.
- Quiet Ink design tokens.
- Dexie local storage foundation.
- Repository-style data access.
- Basic note and block model.
- Custom block editor.
- Autosave.
- Copy block and copy outline workflows.
- JSON backup and import.
- Markdown and HTML export.
- Snippets.
- Tags and search.
- PWA/offline foundation.
- Focused tests for risky behavior.

## What Does NOT Enter

- No accounts.
- No cloud backend.
- No sync implementation.
- No MCP implementation.
- No AI chat.
- No paid/pro gating.
- No Markdown import.
- No HTML import.
- No permanent deletion flow.
- No heavy rich text editor framework.
- No broad dashboard.

## Stage 0 - Project Foundation

### Product Outcome

The project becomes a real runnable app foundation.

### Build

- Initialize SvelteKit with Svelte 5.
- Use pnpm.
- Add Tailwind CSS.
- Add shadcn-svelte setup.
- Add recommended base dependencies from `014` and `015`.
- Create the `src/lib/` module structure from `AGENT.md`.
- Add a minimal route that renders without errors.
- Add a root `README.md`.
- Add Vitest smoke test.
- Add basic app shell with design tokens prepared, not polished screens.

### Done When

- The app installs.
- The app runs locally.
- A smoke test passes.
- `README.md` explains how to run the project.
- The theme token structure exists.

## Stage 1 - Local Data Foundation

### Product Outcome

CopyNotes can remember structured data locally.

### Build

- Add Dexie database setup.
- Define tables for notes, blocks, snippets, tags, tag assignments, and settings.
- Add stable IDs and timestamps.
- Add soft delete fields.
- Add repository functions for each main entity.
- Add migration/version foundation.
- Add simple settings helpers for theme, onboarding, and last opened note.

### Done When

- Notes, blocks, snippets, tags, and settings can be created, read, updated, and soft deleted.
- UI code does not talk directly to Dexie tables.
- Tests cover create/read/update/soft-delete for key entities.

## Stage 2 - Basic Notes And Blocks

### Product Outcome

The user can create a note, write blocks, reload, and continue.

### Build

- Create note list/sidebar foundation.
- Create editor surface.
- Support text and bullet blocks first.
- Add Enter to create a new block.
- Add basic autosave.
- Restore last opened note.
- Add first empty state.

### Done When

- User can create a note.
- User can write multiple blocks.
- User can reload and see the same content.
- Last opened note restores.

## Stage 3 - Block Editor Behavior

### Product Outcome

Writing starts to feel like CopyNotes, not just a text form.

### Build

- Add todo/check blocks.
- Add code/snippet-code blocks.
- Add separators.
- Add Tab and Shift+Tab indentation behavior.
- Add Backspace behavior for empty blocks.
- Add collapse/expand for parent blocks.
- Add slash command menu.
- Add reorder logic and later drag-and-drop UI after a focused prototype.

### Done When

- Nested bullets persist correctly.
- Todos can be checked and unchecked.
- Collapse hides child blocks without deleting them.
- Slash commands are keyboard-friendly.
- Reorder logic does not corrupt parent-child relationships.

## Stage 4 - Copy Workflows

### Product Outcome

Copying becomes a first-class workflow.

### Build

- Add formatter layer for plain text.
- Add formatter layer for HTML clipboard output where supported.
- Add copy selected block only.
- Add copy selected block with children.
- Add copy feedback through a quiet status message.
- Add copy failure handling.

### Done When

- User can copy one block without selecting text manually.
- User can copy a parent block with children.
- Pasted plain text is readable.
- Pasted rich text preserves useful structure where supported.
- Formatter logic is tested without rendering the full editor.

## Stage 5 - Backup, Export, And Import

### Product Outcome

The user can protect their data.

### Build

- Implement CopyNotes JSON backup format from `018`.
- Export all user data as JSON.
- Import CopyNotes JSON backup with validation.
- Recommend exporting current data before import.
- Add safe merge import as default.
- Add replace-all import only behind strong confirmation.
- Export one note as Markdown.
- Export one note as HTML.
- Export snippets where useful.

### Done When

- JSON backup can restore data into an empty database.
- Invalid import is rejected without data loss.
- Import does not silently overwrite existing data.
- Nested notes export cleanly to Markdown and HTML.

## Stage 6 - Snippets, Tags, And Search

### Product Outcome

The app becomes useful for reusable text and lightweight organization.

### Build

- Create snippet from block.
- Create snippet from short text.
- Browse snippets.
- Favorite snippets.
- Insert snippet into current note.
- Create, rename, and soft-delete tags.
- Assign tags to notes, blocks, and snippets.
- Search by text.
- Filter by tags.

### Done When

- Snippets survive even when source blocks are deleted.
- Favorite snippets are easy to find.
- Tags are reusable entities.
- Search excludes soft-deleted content.
- Text search and tag filtering can be combined.

## Stage 7 - PWA, Mobile, Onboarding, And Release Polish

### Product Outcome

CopyNotes feels like a real local app.

### Build

- PWA manifest and service worker.
- Offline behavior checks.
- Dark/light theme switch.
- First-run mini tutorial.
- Editable demo note.
- Help/shortcuts panel.
- Mobile sidebar/drawer behavior.
- Backup screen copy.
- Accessibility pass.
- Playwright critical flows.

### Done When

- App is installable where supported.
- Existing notes can be edited offline.
- User can export backups offline.
- Mobile layout supports writing, copying, snippets, tags, search, and backup.
- Critical flows are tested or manually documented.

## Recommended First Cut

The first real implementation should not attempt the whole MVP.

Recommended first cut:

1. SvelteKit setup.
2. Tailwind and token foundation.
3. Minimal app shell.
4. Dexie database setup.
5. One note with simple blocks.
6. Reload persistence.
7. One smoke test and one storage test.

This gives the project a stable base before the editor becomes more ambitious.

## Definition Of Ready

A stage is ready to start when:

- Relevant specs have been read.
- The intended user outcome is clear.
- Required dependencies are already approved or rechecked.
- Data-loss risks are understood.
- The stage can be completed without unrelated feature work.

## Definition Of Done

A stage is done when:

- The app runs without errors.
- The user outcome works.
- Risky logic has tests.
- Manual checks are documented where automation is not practical.
- Docs/specs are updated if decisions changed.
- No unrelated scope was added.

## Quality Gates

Before calling the MVP ready:

- Create note works.
- Nested bullets work.
- Todo blocks work.
- Collapse/expand works.
- Copy block works.
- Copy with children works.
- Autosave survives reload.
- Snippet creation and insertion work.
- Tags and search work.
- JSON backup roundtrip works.
- Invalid import is safely rejected.
- Dark and light themes work.
- Mobile layout is usable.
- PWA installability is checked.

## Agent Notes

The plan should stay flexible, but the product should not become wider. If a stage reveals a better order, adjust the order without mixing unrelated product areas.
