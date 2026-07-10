# 006 - Tags And Search

## Objective

Give CopyNotes simple organization without folders in the MVP. Tags and search should help users find notes, blocks, and snippets quickly.

## What Enters

- Tags as own entities.
- Tags assignable to notes, blocks, and snippets.
- Search by text.
- Search/filter by tags.
- Simple search UI accessible from minimal editor-first layout.
- Prepared architecture for better search later.

## What Does NOT Enter

- No folders in MVP.
- No complex saved views.
- No full-text search engine dependency unless clearly justified.
- No AI semantic search in MVP.
- No team/shared tags.

## Model Of Data Affected

- `tags`
- note-tag relationships
- block-tag relationships
- snippet-tag relationships
- optional search indexes/helpers

## User Flows

- User creates a tag.
- User tags a note.
- User tags a block.
- User tags a snippet.
- User searches text across notes/blocks/snippets.
- User filters by tag.
- User combines text and tag search.

## Acceptance Criteria

- Tags are reusable entities, not only typed strings.
- Search returns relevant notes/blocks/snippets.
- Deleted content does not appear in normal search results.
- Search and tag filtering work offline.
- Search code is separate enough to upgrade later.
- UI does not force folders or complex organization.

## Minimum Tests

- Create/rename/soft-delete tag.
- Assign tag to note/block/snippet.
- Search by text.
- Filter by tag.
- Ensure soft-deleted content is excluded.
- Combined text + tag filtering.

## Agent Notes

Tags are the MVP organization system. Keep them simple, but design them cleanly because sync, export, and MCP will all need to understand them later.

### Future-Readiness Decisions (decided 2026-07-10)

- **AI/semantic search later:** all search logic must live in `src/lib/search/` behind one plain interface (query text + tag filter in, ranked results out). UI components must not know how matching works, so the engine can be swapped for fuzzy/full-text/AI search without touching the rest of the app.
- **Folders later:** folders stay out of the MVP, but do not hard-code "flat list" assumptions. Note listing flows through the storage repository (`listNotes`), so a future `folderId` field plus a Dexie schema version bump is enough to add grouping. Keep sidebar rendering driven by the repository result, not by bespoke flat-array logic.
