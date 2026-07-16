# 018 - Backup JSON Format

## Objective

Define the first CopyNotes JSON backup format.

This format is the user's safety net. It should be understandable, versioned, validated before import, and stable enough to migrate later.

## Core Decision

The user-facing backup must be a CopyNotes-owned JSON format, not a raw Dexie database dump.

This matters because:

- users need backups that can survive app changes,
- future versions need migrations,
- invalid files must be rejected safely,
- import should not silently overwrite existing data,
- and future sync should not force a full backup redesign.

## File Name

Recommended export file name:

```txt
copynotes-backup-YYYY-MM-DD-HHMM.json
```

Example:

```txt
copynotes-backup-2026-07-09-1630.json
```

## Top-Level Shape

The backup should use this structure:

```json
{
  "format": "copynotes.backup",
  "formatVersion": 1,
  "app": {
    "name": "CopyNotes",
    "version": "0.1.0"
  },
  "exportedAt": "2026-07-09T19:30:00.000Z",
  "exportedBy": {
    "source": "pwa",
    "deviceId": "optional-local-device-id"
  },
  "counts": {
    "notes": 0,
    "blocks": 0,
    "snippets": 0,
    "tags": 0,
    "tagAssignments": 0,
    "settings": 0
  },
  "data": {
    "notes": [],
    "blocks": [],
    "snippets": [],
    "tags": [],
    "tagAssignments": [],
    "settings": []
  }
}
```

## Data Entities

### Note

```json
{
  "id": "note_123",
  "title": "Demo note",
  "createdAt": "2026-07-09T19:00:00.000Z",
  "updatedAt": "2026-07-09T19:20:00.000Z",
  "deletedAt": null,
  "isPrivate": false,
  "sync": {
    "version": 1,
    "updatedBy": "local"
  }
}
```

Required fields:

- `id`
- `title`
- `createdAt`
- `updatedAt`
- `deletedAt`

Optional or prepared fields:

- `isPrivate`
- `sync`

### Block

```json
{
  "id": "block_123",
  "noteId": "note_123",
  "parentBlockId": null,
  "type": "bullet",
  "content": "Write a reusable intro",
  "order": 1000,
  "collapsed": false,
  "codeCollapsed": false,
  "checked": false,
  "createdAt": "2026-07-09T19:01:00.000Z",
  "updatedAt": "2026-07-09T19:15:00.000Z",
  "deletedAt": null,
  "metadata": {},
  "sync": {
    "version": 1,
    "updatedBy": "local"
  }
}
```

Allowed block types for MVP:

- `text`
- `bullet`
- `todo`
- `code`
- `separator`

Required fields:

- `id`
- `noteId`
- `parentBlockId`
- `type`
- `content`
- `order`
- `collapsed`
- `checked`
- `createdAt`
- `updatedAt`
- `deletedAt`

Optional fields:

- `codeCollapsed` — whether a long code block is showing its 6-line preview.
  Missing values from older backups are treated as `false`.

Notes:

- `parentBlockId` is `null` for top-level blocks.
- `order` should leave space between siblings, such as `1000`, `2000`, `3000`, so inserting between blocks is easier.
- `checked` should be `false` for non-todo blocks.
- `codeCollapsed` is independent from `collapsed`; previewing long code must not
  hide nested child blocks.
- `content` can be an empty string for separators.

### Snippet

```json
{
  "id": "snippet_123",
  "name": "Intro response",
  "content": "Thanks for reaching out...",
  "blockSnapshot": null,
  "sourceNoteId": "note_123",
  "sourceBlockId": "block_123",
  "isFavorite": true,
  "createdAt": "2026-07-09T19:10:00.000Z",
  "updatedAt": "2026-07-09T19:12:00.000Z",
  "deletedAt": null,
  "sync": {
    "version": 1,
    "updatedBy": "local"
  }
}
```

Required fields:

- `id`
- `name`
- `content`
- `isFavorite`
- `createdAt`
- `updatedAt`
- `deletedAt`

Optional fields:

- `blockSnapshot`
- `sourceNoteId`
- `sourceBlockId`
- `sync`

Important rule:

Snippets are independent saved content. They may remember their source, but they must not depend on the source note or block still existing.

### Tag

```json
{
  "id": "tag_123",
  "name": "sales",
  "color": "amber",
  "createdAt": "2026-07-09T19:05:00.000Z",
  "updatedAt": "2026-07-09T19:05:00.000Z",
  "deletedAt": null,
  "sync": {
    "version": 1,
    "updatedBy": "local"
  }
}
```

Required fields:

- `id`
- `name`
- `createdAt`
- `updatedAt`
- `deletedAt`

Optional fields:

- `color`
- `sync`

### Tag Assignment

Tags should be reusable entities. The relationship between a tag and content should be stored separately.

```json
{
  "id": "tag_assignment_123",
  "tagId": "tag_123",
  "targetType": "block",
  "targetId": "block_123",
  "createdAt": "2026-07-09T19:06:00.000Z",
  "updatedAt": "2026-07-09T19:06:00.000Z",
  "deletedAt": null
}
```

Allowed `targetType` values:

- `note`
- `block`
- `snippet`

Required fields:

- `id`
- `tagId`
- `targetType`
- `targetId`
- `createdAt`
- `updatedAt`
- `deletedAt`

### Setting

```json
{
  "key": "theme",
  "value": "dark",
  "updatedAt": "2026-07-09T19:00:00.000Z"
}
```

Allowed MVP setting examples:

- `theme`
- `hasCompletedOnboarding`
- `lastOpenedNoteId`

Settings are an explicit exception to the stable-ID and full-timestamp rule used by other entities: the `key` acts as the identifier, and settings do not need `id`, `createdAt`, or soft delete. This exception is also documented in `002-data-model-storage.md`.

Settings should only include safe preferences. Do not export sensitive browser internals.

## Example Minimal Backup

```json
{
  "format": "copynotes.backup",
  "formatVersion": 1,
  "app": {
    "name": "CopyNotes",
    "version": "0.1.0"
  },
  "exportedAt": "2026-07-09T19:30:00.000Z",
  "exportedBy": {
    "source": "pwa"
  },
  "counts": {
    "notes": 1,
    "blocks": 2,
    "snippets": 0,
    "tags": 1,
    "tagAssignments": 1,
    "settings": 1
  },
  "data": {
    "notes": [
      {
        "id": "note_demo",
        "title": "Demo note",
        "createdAt": "2026-07-09T19:00:00.000Z",
        "updatedAt": "2026-07-09T19:20:00.000Z",
        "deletedAt": null,
        "isPrivate": false
      }
    ],
    "blocks": [
      {
        "id": "block_parent",
        "noteId": "note_demo",
        "parentBlockId": null,
        "type": "bullet",
        "content": "Copy this outline",
        "order": 1000,
        "collapsed": false,
        "checked": false,
        "createdAt": "2026-07-09T19:01:00.000Z",
        "updatedAt": "2026-07-09T19:01:00.000Z",
        "deletedAt": null
      },
      {
        "id": "block_child",
        "noteId": "note_demo",
        "parentBlockId": "block_parent",
        "type": "todo",
        "content": "Verify pasted structure",
        "order": 1000,
        "collapsed": false,
        "checked": false,
        "createdAt": "2026-07-09T19:02:00.000Z",
        "updatedAt": "2026-07-09T19:02:00.000Z",
        "deletedAt": null
      }
    ],
    "snippets": [],
    "tags": [
      {
        "id": "tag_demo",
        "name": "demo",
        "color": "amber",
        "createdAt": "2026-07-09T19:03:00.000Z",
        "updatedAt": "2026-07-09T19:03:00.000Z",
        "deletedAt": null
      }
    ],
    "tagAssignments": [
      {
        "id": "tag_assignment_demo",
        "tagId": "tag_demo",
        "targetType": "note",
        "targetId": "note_demo",
        "createdAt": "2026-07-09T19:04:00.000Z",
        "updatedAt": "2026-07-09T19:04:00.000Z",
        "deletedAt": null
      }
    ],
    "settings": [
      {
        "key": "theme",
        "value": "dark",
        "updatedAt": "2026-07-09T19:00:00.000Z"
      }
    ]
  }
}
```

## Validation Rules

Before importing, validate:

- Top-level `format` equals `copynotes.backup`.
- `formatVersion` is supported.
- `data` exists.
- Required arrays exist.
- Required fields exist on each entity.
- Timestamps are valid ISO strings.
- Block types are allowed.
- Tag assignment target types are allowed.
- Block `noteId` references an imported or existing note.
- Block `parentBlockId`, when present, references an imported or existing block.
- Tag assignments reference valid tags and valid targets.
- Counts match actual array lengths, or the app warns and recalculates safely.

Use Valibot for schema validation.

## Import Modes

### Safe Merge - Default

Safe merge should be the default import mode.

Behavior:

- Insert imported records that do not already exist.
- Skip identical records that already exist.
- If an imported ID conflicts with a different local record, preserve both versions.
- When preserving both, generate new IDs for the imported copy and remap related blocks, snippets, and tag assignments.
- Add a clear import summary before applying changes.

This is the safest default because it avoids silent data loss.

### Replace All - Explicit Confirmation Only

Replace all may exist later, but only behind strong confirmation.

Behavior:

- Recommend exporting a current backup first.
- Clearly state that current local data will be replaced.
- Require explicit user confirmation.
- Validate the incoming backup before touching existing data.
- Apply the replacement only after validation succeeds.

Replace all should never happen silently.

## Import Summary

Before applying an import, show a simple summary:

- notes to add
- blocks to add
- snippets to add
- tags to add
- settings to apply
- conflicts detected
- whether IDs will be remapped

Use calm language. The import flow should feel safe, not scary.

## Export Rules

- Export should include soft-deleted records in full JSON backup unless a later privacy decision says otherwise.
- Normal UI export formats like Markdown and HTML should exclude soft-deleted content.
- JSON backup should include enough deleted metadata to support safer future restore and sync behavior.
- Backups should be downloadable offline.

## Privacy Rules

- Backups are plain JSON in the MVP.
- The app should clearly communicate that exported backups may contain private notes.
- Encryption is not required in the MVP.
- Future encrypted backup can be added later, but should not block the first reliable backup format.

## Migration Rules

Future backup versions should be migrated through explicit migration helpers.

Rules:

- Never mutate imported data before validation.
- Keep migration functions versioned.
- Preserve unknown safe metadata when practical.
- Reject unsupported future versions with a clear message.

## Acceptance Criteria

- Full JSON backup can restore CopyNotes data into an empty database.
- Invalid JSON is rejected without changing local data.
- Unsupported backup versions are rejected with a clear message.
- Safe merge does not silently overwrite existing data.
- Tag relationships survive backup roundtrip.
- Nested blocks survive backup roundtrip.
- Snippets remain independent from source blocks.
- Settings restore only safe preferences.

## Minimum Tests

- Validate a correct backup.
- Reject invalid JSON.
- Reject unsupported `formatVersion`.
- Reject missing required arrays.
- Reject invalid block type.
- Export and import nested blocks.
- Export and import snippets.
- Export and import tags and assignments.
- Safe merge with no conflicts.
- Safe merge with ID conflicts and remapping.
- Replace-all validation fails without deleting existing data.

## Agent Notes

Backup is not a technical afterthought. It is how users trust a local-first app.

When in doubt, preserve more user data rather than less.
