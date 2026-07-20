# 026 - Drag-To-Move Selected Text

Created: 2026-07-20.

## Objective

Let the user **move a text selection by dragging it**: select a word (or any
run of characters) inside a block, press on the highlighted text, drag, and drop
it somewhere else — in the same line or another line — where it is **moved**
(cut from the origin, inserted at the drop point), formatting preserved.

This replaces reliance on the browser's native contenteditable drag-and-drop,
which is unreliable: a quick press-drag on a selection re-selects and collapses
the selection instead of moving it (measured: an 8px move drops the selection).
This spec adds a **custom, deterministic** text drag on top of the existing
custom block editor (specs 003, 019, 020).

## Background (limitation found + decision)

Native text DnD in `contenteditable` only enters "drag the text" mode after a
long hold (~½s); a normal quick grab is interpreted as "start a new selection",
so the old selection collapses and the caret jumps to the press point. Users hit
this repeatedly. Rather than fight the browser, we own the gesture: while a text
selection is being grabbed we suppress the native re-select (`selectstart`
`preventDefault`), track the pointer, and perform the move ourselves on drop.

The block-reorder drag controller (`dragReorder.svelte.js`) already gets out of
the way when a text selection is live (spec: the "word drag" guard). This spec
fills that gap with a real text move.

## What enters

- A **text-drag controller** armed from a `pointerdown` that lands **inside the
  current non-collapsed selection**, within one rich block's editable.
- Activation on the **first move past a small threshold** (~5px). On activate,
  suppress native selection (`selectstart` → `preventDefault`) so the highlight
  stays put and the browser does not re-select.
- A **drop indicator**: a thin caret line at the drop position, tracking the
  pointer, resolved with the existing `caretRangeFromPoint` helper (`caret.ts`).
- On drop: **move** the selected content to the drop caret. Source and target
  may be the **same block or different blocks**. Formatting (bold/italic/
  underline/strike/inline-code/link/color) is preserved.
- **Cancel** with Escape, or a drop that lands back inside the original
  selection, or a drop outside any eligible block → no change.
- **Single undo**: one Ctrl/Cmd+Z reverts the whole move (one history snapshot).
- A **pure HTML-transform layer** (unit-testable in jsdom, no pointer/DOM
  choreography) that both the move and its tests call.

## What does not enter

- **Code blocks and separators** as source or target. Code is stored/edited as
  plain text with exact whitespace; a drop onto a code block or separator is a
  no-op in v1.
- **Copy** (duplicate) on drag. This is move-only. No modifier-to-copy in v1.
- **Cross-note** moves — all blocks are in the current note already; nothing new.
- **Auto-scroll** while dragging text (the block-reorder drag has it; text drags
  are short-range in practice). Can be added later if needed.
- Touch long-press for text drag — v1 is pointer/mouse. (Touch users still edit
  and can cut/paste.)

## Model of data affected

No schema change. A block stores `html` (sanitized subset) and `content` (plain
text mirror). A move:

1. Reads the **source block html** and the selection's **plain-text offsets**
   `[start, end)` (via `plainTextOffset` on the live range endpoints).
2. Extracts the **fragment html** for `[start, end)`.
3. Computes **new source html** = source with `[start, end)` removed
   (`removePlainTextRange`).
4. Resolves the **target block id** and a **plain-text drop offset** from
   `caretRangeFromPoint` (+ `plainTextOffset`).
5. Computes **new target html** = target html with the fragment inserted at the
   drop offset. **Same-block move:** target html is the post-removal source html,
   and the drop offset is shifted by `-(end - start)` when it lay after `end`.
6. Persists both blocks through the normal input path (sanitize → `onInput` →
   debounced/structural save), recording **one** history snapshot first.

### Pure helpers (new, in `src/lib/format/`)

- `sliceHtmlByPlainRange(html, start, end) -> fragmentHtml` — the html of the
  plain-text range (reuses `rangeFromTextOffsets` + `cloneContents` on a detached
  element; result sanitized).
- `insertHtmlAtPlainOffset(html, offset, fragmentHtml) -> html` — insert a
  fragment at a plain-text offset (reuses `rangeAtPlainOffset` on a detached
  element; result sanitized).
- A `planTextMove({ sourceHtml, start, end, targetHtml, dropOffset, sameBlock })`
  that returns `{ sourceHtml, targetHtml, caretOffset }`, composing remove +
  slice + insert + the same-block offset shift. This is the single tested seam.

`removePlainTextRange`, `rangeAtPlainOffset`, `rangeFromTextOffsets`,
`plainTextToHtml`, `htmlToPlainText`, `sanitizeHtml` already exist and are reused.

## User flows

**Move a word to another line**
1. User selects `mundo` in "hola mundo".
2. Presses on `mundo`, drags down over "otra linea".
3. A caret line appears in "otra linea" following the pointer.
4. Releases after "otra linea" → source becomes "hola ", target "otra linea mundo".
5. Caret lands right after the moved text. Ctrl/Cmd+Z restores both lines.

**Reorder within the same line**
1. Selects `cruel` in "hola mundo cruel", drags before `mundo`, drops.
2. Line becomes "hola cruel mundo" (offset shift handled), caret after `cruel`.

**Plain click on a selection (unchanged)**
- Press + release with no drag → native behavior: selection collapses, caret at
  the click point. (We only suppress native selection once a drag activates.)

**Cancel**
- Escape mid-drag, or drop inside the original selection / onto a code block /
  separator / outside → nothing moves, selection restored where practical.

## Acceptance criteria

- Selecting text and dragging it moves **only that text**, not the whole line
  (regression guard already added in `move-blocks.spec` stays green).
- A quick grab-and-drag (no long hold) moves the text; the selection does **not**
  collapse mid-drag.
- Formatting inside the moved run survives the move.
- Same-block reorder lands the text at the intended offset (shift correct).
- One Ctrl/Cmd+Z undoes the whole move.
- Dropping on a code block, separator, or outside any editable is a no-op.
- Block-reorder (grip / grab-selection / long-press) is unaffected.

## Minimum tests

**Unit (jsdom, `src/lib/format/`)**
- `sliceHtmlByPlainRange`: extracts a plain run; preserves a `<strong>` that
  spans part of the run.
- `insertHtmlAtPlainOffset`: inserts at start / middle / end; sanitizes.
- `planTextMove`: cross-block move (source shrinks, target grows, caret offset);
  same-block forward move (offset shift applied); same-block backward move; a
  drop offset inside `[start, end)` yields a no-op plan.

**Unit (jsdom, `src/lib/editor/`)**
- Text-drag controller: arms only when pointerdown is inside the selection;
  activates on move past threshold; a release with no move does not move text;
  Escape cancels.

**E2E (`e2e/`)**
- Select a word, drag to another line, assert it moved and the line count/order
  is unchanged (extends the existing word-drag guard).

## Agent notes

- Keep the pure transform (`planTextMove` + the two html helpers) free of pointer
  code so it is testable without a browser — mirror `removePlainTextRange`'s
  style in `sanitize.ts`.
- Suppression of native re-select must begin on the **first qualifying move**,
  not on `pointerdown` (a plain click must still place the caret). Add a
  `selectstart` `preventDefault` listener on activate; remove it on end.
- Resolve the drop offset as an **integer plain-text offset** before mutating any
  DOM, so a same-block move is not corrupted by the source removal.
- The block-reorder controller already bails on a live text selection; do not
  re-arm it here. This controller owns the text-drag path.
- Escape handling and one-snapshot undo should mirror `dragReorder` +
  `recordSnapshot()` in `Editor.svelte`.
