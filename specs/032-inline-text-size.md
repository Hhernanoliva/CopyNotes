# 032 - Text size on the selection (H1/H2/H3 without splitting the row)

Created: 2026-08-01. Approved by Hernan 2026-08-01 (design reviewed in chat:
partial selection = inline size on the marked text only, same line; full-row
selection = block heading, exactly as today; explicitly accepted that inline
size does not survive Markdown export).

## Objective

Pressing **H1 / H2 / H3** with part of a row selected must affect **only the
marked text**, leaving it bigger on the same line. Today those buttons change
`block.type`, so the whole row becomes a heading — correct for a block editor
(Notion and Google Docs behave the same) but surprising, because the buttons
sit next to Bold and Italic in the selection toolbar and read as text format.

The row-level heading stays reachable: selecting the **entire** row and
pressing H1 keeps converting the block, so nothing that works today is lost.

## What enters

- **New inline mark: text size.** Three sizes matching the existing headings,
  stored as `<span class="fmt-size-h1|h2|h3">`, following the `fmt-color-*`
  pattern exactly.
- **The scope rule.** `runFormatCommand` routes `h1`/`h2`/`h3`/`normal` by
  comparing the selected text against the block's text, ignoring leading and
  trailing whitespace:
  - **equal and non-empty** → `setBlockType` (today's behaviour, untouched)
  - **anything else** → the inline size mark on the selected range only
- **Toggle.** Pressing the same size again on already-marked text removes the
  mark. Pressing a different size replaces it. `normal` (¶) on a partial
  selection clears any size mark.
- **Active state.** A size button lights up when the block is that heading
  **or** the caret sits inside a span of that size.
- **Quitar formato** (`clear`) removes size spans in the range, alongside
  `removeFormat`.
- **Undo.** Nothing new: the command already flows through the single door
  `runFormatCommand`, which snapshots before writing (spec 020 / undo work).
- **Sizing.** The same values the block headings use, so the Configuración →
  Tamaño de texto setting (spec 027) scales them with no extra code:
  `1.5rem` / `1.25rem` / `1.1rem`, each `* var(--cn-editor-scale, 1)`.
  Size only — the heading classes carry no weight change either.
- **Guide.** `docs/guia/04-formato-del-texto.md`, section "Títulos", in the same
  commit as the code: what the two gestures do and that the enlarged text is
  size, not a title, so it leaves as plain text when copied out.

## What does not enter

- **Splitting the row.** A partial selection never creates blocks. Rejected in
  design: it fabricates rows and forces decisions about nesting, tasks and undo.
- **Markdown/HTML export of the size.** `htmlInlineToMarkdown` already unwraps
  unknown spans to their text; the size mark keeps that behaviour on purpose.
  Markdown has no "half a row is a heading".
- **Semantics.** The mark is not a heading: it does not enter any heading index
  and screen readers read it as ordinary text. Accepted by Hernan.
- **Arbitrary font sizes / a size picker.** Only the three existing steps.
- **Changing which buttons are enabled.** `commandsForSelection` keeps
  `blockType: true` under the same conditions as today (still off for code and
  separator blocks, and for selections spanning several blocks).

## Model of data affected

No schema change. The mark lives inside `block.html`, which already carries
inline formatting.

`sanitize.ts` states the contract for a new inline format in its own header.
All four points apply:

1. **`sanitize.ts`** — `span` is already allowed; today it keeps a span only
   when it carries an approved `fmt-color-*` class and rewrites `class` to that
   single value. It must keep **approved size classes too**, and preserve both
   when a span carries a color and a size. A span with neither is unwrapped, as
   now.
2. **`sizes.ts`** (new, twin of `colors.ts`) — the single list of approved size
   classes, consumed by `sanitize.ts` and the toolbar.
3. **`inline-markdown.ts`** — unchanged behaviour, locked by a new test: a size
   span converts to its bare text.
4. **`commands.ts`** — `applySize(className)`, mirroring `applyColor`: unwrap an
   enclosing size span, then wrap the range unless the call was a removal or a
   toggle-off of the same class.

Also touched:

- **`active.ts`** — read `fmt-size-*` into a new `size` field, next to `color`.
- **`safety.ts`** — new pure `selectionCoversBlock(selectedText, blockText)`.
  It trims both sides and returns false for empty text, so the phantom `"\n"`
  an empty row stores can never read as "the whole row is selected".
- **`app.css`** — three `.cn-editor .fmt-size-*` rules next to `.fmt-color-*`.

## User flows

1. **Enlarge part of a row.** Type `Precios de temporada — todo lo que tenés que
   saber`, select `Precios de temporada`, press **H1**. That fragment renders at
   heading-1 size on the same line; the block stays `text`.
2. **Make a real heading.** Select the whole row, press **H1**. The row becomes
   `heading1` — same as today, exports as `#`.
3. **Undo the size.** Press **H1** again with the caret inside the enlarged
   text: it returns to normal size.
4. **Clean up.** With the enlarged text selected, **¶** or **Quitar formato**
   both return it to normal size.
5. **Undo.** `Ctrl/Cmd+Z` after any of the above reverts that one step.

## Acceptance criteria

- Partial selection + H1/H2/H3 wraps only the selected range; `block.type` is
  unchanged.
- Full-row selection + H1/H2/H3 changes `block.type` and adds no span.
- Whitespace at either end of the selection does not change which path runs.
- Same button pressed twice on the same text leaves no size span behind.
- The size survives a save/reload, an internal copy-paste, and a backup
  round-trip (it passes the ingest gate).
- Copying to Markdown yields the text without any size decoration.
- The size steps follow the Configuración → Tamaño de texto setting.
- An empty row (`"\n"` content) never takes the block-heading path from a
  selection.

## Minimum tests

Unit:

- `sizes.test.ts` — the three entries and their `fmt-size-<id>` classes.
- `sanitize.test.ts` — keeps `fmt-size-h1`; unwraps `fmt-size-evil`; keeps a
  span carrying both an approved color and an approved size.
- `inline-markdown.test.ts` — `<span class="fmt-size-h1">Hola</span>` → `Hola`.
- `active.test.ts` — reads the size class into `size`.
- `safety.test.ts` — `selectionCoversBlock`: equal text true; trailing/leading
  space still true; substring false; empty and `"\n"` false.

E2E (`e2e/formatting.spec.ts`):

- Partial selection + H1 → the span exists and the row is still a text block.
- Full-row selection + H1 → the row is a heading block and carries no size span.
- Pressing H1 twice removes the mark.
- `Ctrl/Cmd+Z` reverts an applied size.

## Agent notes

- `applySize` inherits `applyColor`'s ceiling: a selection that partially
  overlaps an existing span is handled by unwrapping the enclosing span first,
  which is correct for the common cases and imperfect for exotic overlaps. Same
  trade-off already shipped for colors; not widened here.
- The toolbar's `active` object gains `size`; `FloatingFormattingToolbar` needs
  no structural change — the heading buttons already read `active.h1/h2/h3`.
- Do not add the size to `settings-registry.ts`: it is note content, not a
  preference.
