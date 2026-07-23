---
name: verify
description: How to build, launch, and drive CopyNotes end-to-end for runtime verification.
---

# Verifying CopyNotes

## Launch

```bash
pnpm dev --port 5199   # background; ready in ~2s, check curl http://localhost:5199/
```

## Drive (GUI surface)

Playwright IS a project dev dependency (`@playwright/test`). Drive the app with
the project's own runner: `pnpm test:e2e` (Chromium) or `pnpm test:e2e:webkit`
(Safari/WebKit engine). Specs live in `e2e/`; install the browser once with
`pnpm exec playwright install chromium` (or `webkit`).

## Gotchas

- Fresh browser context = fresh IndexedDB → first run seeds the welcome demo
  note ("👋 Bienvenido a CopyNotes"), NOT the empty state. It seeds once (the
  `demoNoteCreated` flag); the empty state only shows if that flag is already
  set. Two buttons match "Nueva nota" (header icon + empty-state CTA) — `.last()`.
- Structural keys (Enter/Tab) persist to IndexedDB before focus moves to the
  new block. Type with `{ delay: 25 }` and wait ~150ms after Enter/Tab, or
  keystrokes land in the previous block.
- Autosave is debounced 500ms — wait ~700ms before reload-persistence checks.
- Collapse chevrons are opacity-0 until hover but still clickable by Playwright.

## Flows worth driving

- Create note → title → Enter → type blocks → Tab/Shift+Tab → reload →
  assert `style.paddingLeft` per row (1.5rem per depth level).
- Slash menu: type "/" in a block → `[role="listbox"]` appears; filter,
  ArrowUp/Down, Enter, Escape.
- Todo: `[role="checkbox"]`, `aria-checked` persists across reload.
- Selectors: blocks are `main [role="textbox"]`, rows `main .group`,
  separator `[role="separator"]`.
