# 002 - Data Model And Storage

## Objective

Define the local-first data model and persistence layer for CopyNotes. The app must feel simple to the user, but internally it must store structured notes, blocks, tags, snippets, and settings.

## What Enters

- Dexie.js over IndexedDB.
- Database schema for notes/documents, blocks, snippets, tags, tag assignments, and settings.
- Stable IDs for every persisted entity.
- Created and updated timestamps.
- Soft delete metadata.
- Repository-style access functions.
- Migration strategy for future schema changes.
- Future sync fields where useful, without implementing sync.

## What Does NOT Enter

- No Supabase or cloud backend in MVP.
- No user accounts.
- No real-time collaboration.
- No encryption in MVP.
- No permanent deletion in MVP.

## Model Of Data Affected

### Note / Document

Required fields:

- `id`
- `title`
- `createdAt`
- `updatedAt`
- `deletedAt` or equivalent soft delete marker
- tag relationship
- future sync metadata placeholder if needed

### Block

Required fields:

- `id`
- `noteId`
- `parentBlockId` when nested
- `type`: `text`, `bullet`, `todo`, `code`, `separator`
- `content`
- `order`
- `collapsed`
- `checked`
- `createdAt`
- `updatedAt`
- `deletedAt` or equivalent soft delete marker
- tag relationship

### Snippet

Required fields:

- `id`
- `name`
- `content` or block snapshot
- optional `sourceNoteId`
- optional `sourceBlockId`
- `isFavorite`
- `createdAt`
- `updatedAt`
- `deletedAt`
- tag relationship

### Tag

Required fields:

- `id`
- `name`
- optional `color`
- `createdAt`
- `updatedAt`
- `deletedAt`

### Tag Assignment

Tags are reusable entities, so the relationship between a tag and the content it marks is stored separately.

Required fields:

- `id`
- `tagId`
- `targetType`: `note`, `block`, or `snippet`
- `targetId`
- `createdAt`
- `updatedAt`
- `deletedAt`

### Setting

Settings are simple keyed preferences, such as `theme`, `hasCompletedOnboarding`, and `lastOpenedNoteId`.

Required fields:

- `key`
- `value`
- `updatedAt`

Settings are an explicit exception to the stable-ID and full-timestamp rule: the `key` acts as the identifier, and settings do not need `createdAt` or soft delete. Future sync should treat settings as last-write-wins preferences, not as documents.

## User Flows

- Create a note and reload the browser: note remains.
- Create nested blocks and reload: hierarchy remains.
- Delete a block: it disappears from the UI but remains recoverable internally.
- Create a snippet from a block: snippet survives even if original block is deleted.

## Acceptance Criteria

- Storage operations are not scattered directly inside UI components.
- Repositories or equivalent data functions exist for notes, blocks, snippets, tags, and settings.
- The app can save and read structured data from IndexedDB through Dexie.
- Soft deleted records are filtered from normal UI views.
- IDs and timestamps are consistently generated.
- Future sync does not require replacing the whole local model.

## Minimum Tests

- Create/read/update soft-delete note.
- Create nested blocks and verify parent-child relationships.
- Reorder sibling blocks and verify order.
- Create independent snippet from block snapshot.
- Tag entity creation and assignment.

## Agent Notes

Treat the storage layer like the app's memory. UI components should ask storage services for data; they should not directly know the low-level database details.
