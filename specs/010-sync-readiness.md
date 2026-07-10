# 010 - Sync Readiness

## Objective

Prepare CopyNotes for future sync after MVP validation, without implementing accounts or cloud infrastructure in MVP.

## What Enters

- Stable IDs and timestamps across all entities.
- Clear local data ownership boundaries.
- Future sync adapter interface or documented seam.
- Conflict strategy prepared: preserve both versions and warn user.
- Offline-first assumptions preserved.
- Backend choice remains open.
- Supabase may be evaluated later, but is not required now.

## What Does NOT Enter

- No login in MVP.
- No Supabase implementation in MVP.
- No cloud storage in MVP.
- No real-time collaboration.
- No paid sync feature in MVP.

## Model Of Data Affected

All persisted entities must be sync-ready:

- notes
- blocks
- snippets
- tags
- settings/preferences
- future user/account fields
- future conflict/version metadata

## User Flows

MVP user flow is invisible: users should not see sync. The technical flow is:

- Local changes have stable IDs.
- Local changes have `createdAt` and `updatedAt`.
- Deleted items use soft delete.
- Future sync can read changes through storage layer.

Future sync flow:

- User logs in with Google/Apple.
- App uploads local data with consent.
- App downloads remote changes.
- If same item changed in two places, app preserves both versions and asks user.

## Acceptance Criteria

- UI components do not directly depend on Dexie details.
- Storage functions could later be wrapped by sync logic.
- All persisted entities use stable IDs, except settings, which are keyed preferences as documented in `002-data-model-storage.md`.
- Soft delete exists.
- No code assumes only one device forever.
- Backend choice is documented as open.

## Minimum Tests

- Verify entity creation includes stable ID and timestamps.
- Verify soft delete preserves deleted records.
- Verify storage API can return changed records if such helper exists.
- Unit test conflict helper placeholder if implemented.

## Agent Notes

Sync is one of the first likely post-MVP features, so do not build the MVP in a way that makes sync feel like a rewrite.
