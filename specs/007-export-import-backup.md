# 007 - Export, Import And Backup

## Objective

Protect user data in a local-first app. Export/import is mandatory for MVP because browser local data can be lost if the user clears site data or changes devices.

## What Enters

- Export all user data.
- Export one note/document.
- Export snippets.
- User can choose export format.
- JSON backup format for full restore.
- Markdown export for notes.
- HTML export for notes.
- Import CopyNotes JSON backup.
- Import validation.
- Warning/recommendation to export current backup before importing.
- Clear backup screen explaining local data risk.

## What Does NOT Enter

- No Markdown import in MVP.
- No HTML import in MVP.
- No automatic scheduled cloud backup.
- No background sync.
- No permanent deletion flow.

## Model Of Data Affected

Export/import touches:

- notes
- blocks
- snippets
- tags
- settings/preferences where safe
- backup metadata/version

## User Flows

- User exports all data as JSON.
- User exports a note as Markdown.
- User exports a note as HTML.
- User exports snippets.
- User imports a CopyNotes JSON backup.
- App validates backup before applying.
- App recommends current backup before import.
- App does not silently overwrite data without a clear user action.

## Acceptance Criteria

- JSON backup can restore CopyNotes data reliably.
- Exported Markdown is readable outside CopyNotes.
- Exported HTML preserves useful structure.
- Import rejects invalid or incompatible files safely.
- Import flow communicates risk clearly without being scary.
- Backup format includes a version number.
- Backup/export works offline.
- The detailed JSON backup contract follows `018-backup-json-format.md`.

## Minimum Tests

- Export full JSON and import into empty database.
- Import invalid JSON and verify no data loss.
- Export nested note to Markdown.
- Export nested note to HTML.
- Verify tags/snippets survive JSON roundtrip.
- Playwright critical flow: create data, export, clear test DB, import, verify data.

## Agent Notes

Backup is not an optional extra. In a local-first product, backup is part of trust.
