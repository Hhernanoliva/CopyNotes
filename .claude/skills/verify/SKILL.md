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

Playwright is NOT a project dependency. Install `playwright-core` in the
scratchpad and use the cached headless shell:

```js
executablePath: `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`
```

(`chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app` also exists.)

## Gotchas

- Fresh browser context = fresh IndexedDB; first screen is the empty state.
  Two buttons match "Nueva nota" (header icon + empty-state CTA) — use `.last()`.
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
