# 008 - PWA, Offline And Theme

## Objective

Make CopyNotes feel like a real local app even though it starts as web/PWA. It must be installable, usable offline, dark-first, and responsive.

## What Enters

- PWA manifest.
- Service worker/offline behavior where appropriate.
- ~~Discreet install suggestion.~~ **Superseded (2026-07-31):** the install card
  is gone. Installing the page produced a look-alike app that cannot host the
  agent channel (`028`), and people mistook it for the desktop build MCP needs.
  The same slot now points at the desktop download (`src/lib/desktop/`). The
  manifest and service worker stay: offline is untouched, and a browser can
  still install from its own menu.
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
- User on a desktop browser sees a discreet, dismissible card pointing at the
  desktop app download (needed only for agents); it never shows on touch-only
  devices or inside the desktop app itself.
- User switches between dark and light theme.
- User opens app on mobile and can access panels through buttons.

## Acceptance Criteria

- App stays installable as a PWA from the browser's own menu, but never offers
  it: the in-app card points at the desktop build instead (see What Enters).
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
- Manual offline + desktop-download check documented (`docs/release-checklist.md`).

## Agent Notes

Offline is part of the product promise. Do not implement features that secretly require internet during normal note-taking.
