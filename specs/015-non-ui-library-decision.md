# 015 - Non-UI Library Decision

## Objective

Document the recommended non-UI library direction for CopyNotes before implementation begins. The goal is to keep the MVP lightweight, local-first, reliable, and easy for agents to maintain.

Last reviewed: 2026-07-09.

## Decision

CopyNotes should use a small, deliberate dependency set.

Recommended from the start:

- `dexie` for local IndexedDB persistence.
- `valibot` for validating JSON backups, import payloads, and other external data.
- `@vite-pwa/sveltekit` for PWA manifest and service worker setup.
- `vitest` for logic tests.
- `@testing-library/svelte` for important component behavior tests.
- `@playwright/test` for critical user flows.

Recommended only when the related feature needs it:

- `MiniSearch` for local full-text search if simple in-memory search becomes insufficient.
- `@dnd-kit/svelte` or `svelte-dnd-action` for block drag and drop, after a focused editor prototype proves which one handles nesting, touch, keyboard behavior, and Svelte 5 best.
- `dexie-export-import` only as an internal developer/admin utility if useful, not as the main user-facing backup format.

Avoid in the MVP unless a specific spec later changes the decision:

- TipTap, Lexical, ProseMirror, or CodeMirror as the main editor engine.
- Markdown/HTML parsing libraries such as `marked`, `turndown`, or `sanitize-html`.
- Syntax highlighters such as `shiki` or `highlight.js`.
- Large utility libraries such as `lodash`.
- Date libraries such as `date-fns` unless native date handling becomes insufficient.
- File-saving helpers such as `file-saver` unless native browser download APIs are not enough.
- ID libraries such as `nanoid` unless browser-native IDs are insufficient for the final sync-readiness model.

## Rationale

CopyNotes is a local-first writing app. Its biggest risks are data loss, broken block hierarchy, unreliable copy output, broken backup/import, and an editor that becomes too hard to change.

The MVP should therefore prefer:

- native browser APIs when they are enough,
- small libraries where they remove real risk,
- testable product logic over hidden package behavior,
- explicit CopyNotes data formats over raw database dumps,
- and delayed decisions for areas that need hands-on prototyping.

The product should not install heavy editor, parsing, search, export, or utility packages just because they may be useful later.

## What Enters

- Dexie as the local database wrapper.
- Repository-style storage functions around Dexie.
- A CopyNotes-owned JSON backup format with a version number.
- Valibot schemas for import validation and any other untrusted data.
- SvelteKit PWA support through `@vite-pwa/sveltekit`.
- Vitest, Testing Library, and Playwright as the testing stack.
- Native browser APIs for clipboard, file download, file import, dates, and IDs when practical.

## What Does NOT Enter

- No cloud database or sync package in the MVP.
- No rich text editor framework in the MVP.
- No Markdown import in the MVP.
- No HTML import in the MVP.
- No broad utility library for convenience alone.
- No search engine dependency before simple search is proven insufficient.
- No syntax highlighting dependency before code blocks require real highlighting.
- No backup format that depends only on raw Dexie table export.

## Model Of Data Affected

This decision affects:

- notes
- blocks
- snippets
- tags
- settings/preferences
- backup metadata
- import validation
- local search indexes
- future sync-readiness metadata

The canonical backup should be a CopyNotes data format, not a direct copy of Dexie internals. This keeps backups understandable, versionable, and safer to migrate later.

## User Flows

The recommended libraries should support:

- User creates notes and blocks, then reloads and sees data preserved.
- User exports all CopyNotes data to a JSON backup.
- User imports a CopyNotes JSON backup and invalid data is rejected safely.
- User searches notes, blocks, snippets, and tags offline.
- User installs the app as a PWA where supported.
- User writes and reorganizes nested blocks without hierarchy corruption.
- User can trust that tests cover risky local-first behavior.

## Acceptance Criteria

- `dexie` is the only low-level persistence layer in the MVP.
- UI components do not talk directly to Dexie tables; they use storage/repository functions.
- JSON backup/import validation uses explicit schemas.
- The user-facing backup format includes a version number and product metadata.
- Markdown and HTML exports are generated from CopyNotes blocks directly when possible.
- Search starts simple and only adds `MiniSearch` if needed.
- Drag and drop is selected through a focused prototype, not assumed from package popularity.
- The main editor remains custom and block-oriented in the MVP.
- Any new non-UI dependency must explain what real product risk or complexity it removes.

## Minimum Tests

When these libraries are introduced, include:

- Vitest tests for Dexie repository create/read/update/soft-delete behavior.
- Vitest tests for backup export/import validation.
- Vitest tests for nested block hierarchy operations.
- Vitest tests for search helpers.
- Component tests for backup/import dialogs when implemented.
- Playwright critical flows for persistence, backup roundtrip, copy behavior, and mobile smoke checks.

## Library Notes

### Dexie

Use for browser-local structured storage through IndexedDB. Keep all direct Dexie usage inside the storage layer.

### Valibot

Use for validating imported JSON backups and any future external payloads. Validation should fail safely before writing to local storage.

### @vite-pwa/sveltekit

Use for PWA installability and offline support. Offline editing should still rely on local storage, not on network availability.

### MiniSearch

Keep as the preferred future search upgrade when basic search becomes too limited. Do not install before the search feature needs indexing, ranking, or better full-text behavior.

### Drag And Drop

Do not decide solely from package popularity. The chosen drag-and-drop tool must preserve nested block relationships and feel good on both desktop and mobile.

Prototype both if needed:

- `@dnd-kit/svelte`: promising Svelte 5-first option.
- `svelte-dnd-action`: mature Svelte drag-and-drop option.

### Editor Frameworks

TipTap, Lexical, ProseMirror, and CodeMirror are legitimate tools, but they are too heavy as the default MVP editor choice. CopyNotes should start with a custom block editor while keeping boundaries clean enough to adopt a richer editor later if users need it.

### Markdown And HTML Libraries

The MVP exports Markdown and HTML from structured blocks. It does not import Markdown or HTML. Therefore, parser/converter libraries should wait until import or richer rendering becomes a real product requirement.

### Native Browser APIs

Prefer native browser APIs when practical:

- `crypto.randomUUID()` for stable IDs unless sync-readiness needs a different strategy.
- `Date` and ISO strings for timestamps.
- `Blob`, `URL.createObjectURL`, and anchor downloads for exports.
- `FileReader` or file input APIs for imports.
- Clipboard APIs wrapped behind a small CopyNotes utility.

Wrap browser APIs behind small internal utilities where it helps future Tauri support.

## Recheck Rule

Because JavaScript libraries change quickly, agents should recheck package status before installation if:

- more than six months have passed since the last review,
- SvelteKit, Svelte, Vite, or Tailwind has a major version change,
- the library would become central to data safety,
- the feature touches backup/import, storage, editor state, or drag and drop,
- or a recommended package appears inactive or incompatible.

## Useful Sources

- Dexie: https://dexie.org/
- Dexie export/import: https://dexie.org/docs/ExportImport/dexie-export-import
- Valibot: https://valibot.dev/
- MiniSearch: https://lucaong.github.io/minisearch/
- Vite PWA SvelteKit: https://vite-pwa-org.netlify.app/frameworks/sveltekit.html
- dnd-kit Svelte: https://dndkit.com/svelte/quickstart
- svelte-dnd-action: https://www.npmjs.com/package/svelte-dnd-action
- Vitest: https://vitest.dev/
- Testing Library Svelte: https://testing-library.com/docs/svelte-testing-library/intro/
- Playwright: https://playwright.dev/docs/intro

## Agent Notes

Every dependency should earn its place. If a library does not directly protect user data, improve core writing/copying behavior, reduce meaningful complexity, or support offline/PWA reliability, delay it.
