# 020 - Inline Formatting And Floating Toolbar

Created: 2026-07-11.

## Objective

Add a Workflowy-style **floating formatting toolbar** to the block editor, plus
the inline and block-level formatting it drives: headings (H1/H2/H3), bold,
underline, italic, strikethrough, inline code, links, and a small fixed text
color palette.

This is a deliberate, scoped extension of the **current custom block editor**
(specs 003, 019). It does **not** migrate to a heavy editor engine (TipTap,
Lexical, ProseMirror). It reaches inline rich text by **unlocking the existing
`contenteditable`** (dropping `plaintext-only`) and storing a **sanitized HTML
subset** per block, instead of adopting a third-party editor.

### Why this approach (limitation found + decision)

The current editor stores each block's `content` as **plain text** and runs the
editable box in `contenteditable="plaintext-only"`, which the browser uses to
physically strip inline formatting. Spec 003 chose this on purpose ("no complex
rich text formatting in MVP").

Block-level formatting (headings) fits the existing `type` model and is low
risk. Inline formatting (bold/italic/link/color) genuinely requires changing how
a line is stored, edited, copied, searched, and exported.

Three options were considered:

1. **Adopt a rich-text engine (TipTap/Lexical).** Rejected: heavy and would
   replace the custom block editor — exactly what the request forbids and what
   specs 003/015/019 deliberately avoid.
2. **Custom parallel "marks" model** (plain text + range annotations). Workable
   but reimplements what `contenteditable` already gives natively, and keeping
   ranges in sync with arbitrary editing is bug-prone.
3. **Sanitized HTML subset (chosen).** `contenteditable` already produces HTML
   natively; unlock it, constrain the allowed tags with a sanitizer, and keep a
   derived plain-text projection for the features that need it. Lightest path
   that reuses the browser, no dependency, no editor replacement. Approved by
   Hernan 2026-07-11.

## What Enters

- **Storage change**: each formatting-capable block stores an `html` field
  (sanitized subset) as its canonical rendered content, plus the existing
  `content` field kept as a **derived plain-text projection**. Dexie schema
  version bump + forward migration (old plain-text blocks read as `html`).
- **Editable unlock**: paragraph/heading/bullet/todo editable boxes switch from
  `contenteditable="plaintext-only"` to `contenteditable="true"`, with a
  sanitizer on input/paste. **Code blocks stay literal plain text** (unchanged).
- **Block types**: `heading1`, `heading2`, `heading3` added alongside existing
  `text`, `bullet`, `todo`, `code`, `separator`. Slash commands `/h1 /h2 /h3`.
- **Inline formats**: bold (`<strong>`), italic (`<em>`), underline (`<u>`),
  strikethrough (`<s>`), inline code (`<code>`), link (`<a>`), text color
  (`<span>` with a color class).
- **Floating toolbar** components:
  - `FloatingFormattingToolbar` — appears on text selection or when the caret is
    inside already-formatted text; positioned above the selection (below when no
    room); hides on selection loss / outside click; never shifts page content.
  - `FormattingButton` — reusable button with normal/hover/active/disabled
    states, `aria-label`, tooltip (name + shortcut), non-color-only active state.
  - `LinkEditorPopover` — add/edit/remove a URL; accepts URLs with or without
    scheme (normalizes to a valid one); external links open in a new tab.
  - `TextColorPopover` — small fixed palette (no free color picker).
- **Formatting engine** module (logic separated from the toolbar UI) exposing
  clear commands: `queryActiveFormats`, `applyFormat`, `removeFormat`,
  `setBlockType`, `createLink`, `editLink`, `removeLink`.
- **Keyboard shortcuts**: Ctrl/Cmd+B, +I, +U, +Shift+S, +K — active even when
  the toolbar is not visible.
- **"More options" (⋯)** menu: `Quitar formato` (clear formatting) and
  `Copiar texto seleccionado`. Built so more options can be added later.
- Guide (`docs/guia-de-uso.md`) updated in the same commit(s), with date bump.

## What Does NOT Enter

- No third-party / heavy editor engine. No editor replacement.
- No free-form color picker (fixed palette only, this version).
- No continuous character-level selection **across** blocks (spec 019 keeps
  cross-block selection at block level; inline formatting is within one block).
- No block-type change or inline-code toggle applied to a multi-block selection
  (those buttons disable when the selection spans blocks — see safety rules).
- No rich formatting inside `code` blocks (they stay literal plain text).
- No Markdown copy-out format in this spec (external copy stays plain text;
  internal copy keeps structure). Markdown export remains a future option.
- No nested/mixed-format edge polishing beyond the sanitized subset (e.g. no
  tables, images, block quotes, font sizes, highlights).

## Model Of Data Affected

`blocks` model:

- **New** `html` (string): sanitized canonical content for formatting-capable
  block types. Empty string for `separator`.
- **Kept** `content` (string): plain-text projection derived from `html`
  (`textContent`). Continues to feed copy-out, search indexing, and export.
- **New** block `type` values: `heading1`, `heading2`, `heading3`.
- Unchanged: `parentBlockId`, `order`, `collapsed`, `checked`, `note`,
  timestamps, soft-delete.

Dexie: bump `db.version`, add an upgrade that sets `html` from existing
`content` for every block (plain text is valid HTML-subset content). Search
(`content`), export/import, copy serialization continue to key off `content`;
they additionally carry `html` where structure is preserved internally.

**Sanitizer allow-list** (everything else stripped to text): `strong`/`b`,
`em`/`i`, `u`, `s`/`strike`, `code`, `a` (href normalized, `target="_blank"`,
`rel="noopener noreferrer"`), `span` (only a `class` from the color set),
`br`. Attributes outside this list are removed. `b`/`i`/`strike` are normalized
to `strong`/`em`/`s` on save.

## Text Color Palette (Quiet Ink)

Fixed set of 6, each a CSS class resolving to a theme-aware token (readable in
light and dark, meets contrast; color never the only signal for the button
state):

- `Por defecto` (removes color span) · `Ámbar` (accent) · `Rojo` · `Verde` ·
  `Azul` · `Gris tenue`.

Defined as `--fmt-color-*` CSS variables in `app.css` with light/dark values,
following the token convention in `CLAUDE.md` (no raw hex in components).

## User Flows

- User selects text within a block → toolbar appears above the selection.
- User clicks Bold (or Ctrl/Cmd+B) → selection toggles bold; button shows active
  when the caret/selection is bold.
- User places the caret inside already-bold text (no selection) → toolbar shows
  with Bold active.
- User clicks H2 → the current block becomes a level-2 heading (no new block, no
  duplicate). "Texto normal" converts a heading back to a paragraph.
- User clicks Link (or Ctrl/Cmd+K) → popover to enter/paste a URL; if the
  selection already has a link, popover lets them edit or remove it. `example.com`
  is saved as `https://example.com`. Link opens in a new tab.
- User clicks Color → small palette; picks a color or "Por defecto" to clear it.
- User clicks ⋯ → `Quitar formato` or `Copiar texto seleccionado`.
- Selection spanning multiple blocks → unsafe buttons (block type, inline code)
  are disabled; safe ones remain; no block outside the selection is modified.
- User clicks a toolbar button → the text selection is preserved (mousedown
  prevents default so focus/caret stay in the block).
- User reloads the app → all formatting is intact (persisted in local storage).
- Escape closes any open popover/menu and returns focus to the editable box.

## Acceptance Criteria

- Selecting text shows the toolbar, correctly positioned near the selection
  (above, or below when there is no room).
- All primary formats work: H1/H2/H3, normal text, bold, underline, italic,
  strikethrough, inline code, link, text color.
- Buttons reflect the active format at the caret/selection (bold+italic → both
  active; caret in an H2 → H2 active).
- The text selection is not lost when using the toolbar; the caret does not jump
  unexpectedly; no duplicate blocks are created.
- Keyboard shortcuts work, including when the toolbar is hidden.
- Content keeps its formatting after reloading the app (persisted correctly).
- Existing behavior is intact: blocks, bullets, checks, collapse, copy button,
  snippets, tags, internal paste, search, export/import.
- Old plain-text notes migrate without loss.
- Accessibility: every button has `aria-label`; keyboard navigable; Escape
  closes popovers and returns focus; active state is not color-only; readable
  contrast.
- Works in Chrome, Safari, Firefox, and mobile web; ready for a future desktop
  build.
- Code is structured so new toolbar options can be added later without touching
  the toolbar layout (engine commands are the seam).

## Minimum Tests

Engine / pure logic (unit):

- `queryActiveFormats` reports the correct set for a given selection/caret.
- `applyFormat` / `removeFormat` toggle each inline format idempotently.
- `setBlockType` converts type without creating/duplicating blocks and strips
  bullet/check affordances from headings.
- Link create/edit/remove; URL normalization (`example.com` → `https://…`);
  `target`/`rel` set for external links.
- Sanitizer: allowed tags survive, disallowed tags/attributes are stripped,
  `b`/`i`/`strike` normalized, malicious markup (e.g. `<script>`, `onclick`)
  removed.
- `html` ↔ plain-text `content` projection stays consistent.
- Dexie migration: plain-text blocks upgrade to valid `html` with no loss.
- Multi-block selection disables unsafe commands.

Behavior:

- Toolbar appears on selection and on caret-in-formatted-text; hides on blur /
  outside click.
- Buttons reflect active format.
- Selection preserved after clicking a toolbar button.
- Format persists across a reload.
- Existing editor behaviors (bullets/checks/collapse/copy/snippets/tags/paste/
  search/export) still pass.

## Agent Notes

- Keep formatting logic in a dedicated engine module; the toolbar and popovers
  are presentation only. This is the extension seam for future options.
- Reuse the existing `content` (plain text) everywhere it is already consumed
  (copy serialize, search dataset, export) — derive it from `html`, do not
  fork those features.
- Code blocks must remain `plaintext-only` / literal; do not unlock them.
- Preserve the caret-in-block guarantee: toolbar buttons use
  `mousedown`+`preventDefault` so the selection is not lost.
- Do not rename shadcn component tokens; add `--fmt-color-*` custom variables
  following the `CLAUDE.md` token convention.
- Cross-block selection stays block-level (spec 019); inline formatting is
  within a single block only.
- This spec extends specs 003 and 019; it does not override spec 015's
  documented rich-editor escape hatch — it is a lightweight in-house alternative,
  not the TipTap/Lexical migration.
