# 008 - PWA, Offline And Theme

## Objective

Make CopyNotes feel like a real local app even though it starts as web/PWA. It must be installable, usable offline, dark-first, and responsive.

## What Enters

- PWA manifest.
- Service worker/offline behavior where appropriate.
- Discreet install suggestion.
- Offline ability to read, create, edit, use snippets, and export backups.
- Dark theme as primary.
- Light theme also available in MVP.
- Theme preference persistence.
- Responsive desktop + mobile support.
- Mobile navigation panels for sidebar/drawer.
- Avoid browser-only decisions that hurt future Tauri.

## What Does NOT Enter

- No native desktop app in MVP.
- No push notifications.
- No complex theme marketplace.
- No advanced visual customization in MVP.

## Model Of Data Affected

- user settings/preferences
- theme preference
- PWA/cache metadata if needed

## User Flows

- User opens app offline and edits existing notes.
- User creates a new note offline.
- User uses snippets offline.
- User exports a backup offline.
- User sees a discreet install prompt.
- User switches between dark and light theme.
- User opens app on mobile and can access panels through buttons.

## Acceptance Criteria

- App is installable as PWA where browser allows it.
- Offline mode supports real work, not only reading.
- Dark theme is polished enough to be the main experience.
- Light theme is usable.
- Theme tokens make future visual changes easier.
- Mobile layout does not break core writing/copy flows.
- Future Tauri path is not blocked by unusual browser dependencies.

## Minimum Tests

- Test theme preference storage.
- Component test for theme switching.
- Playwright flow for reload/offline-like persistence where practical.
- Playwright mobile viewport smoke test.
- Manual PWA installability check documented.

## Agent Notes

Offline is part of the product promise. Do not implement features that secretly require internet during normal note-taking.
