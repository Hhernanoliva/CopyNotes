# 019 - Editor UX Fixes (Camino A)

Created: 2026-07-11.

## Objective

Resolve a batch of daily-writing friction points on the **current custom block
editor**, without migrating to a heavy editor engine. This spec deliberately
keeps CopyNotes on the block-per-editable model documented in specs 003 and 015.

It does **not** override spec 015. The rich-editor escape hatch (TipTap/Lexical)
stays a documented future contingency, not a plan. The one user request that
truly needs that migration — continuous character-level text selection across
lines — is explicitly **out of scope** here and stays as block-level selection.

## Background: why these fixes are patches

In the current editor each line ("renglón") is its own `contenteditable` box.
Inside one box the browser gives caret motion, text selection, line breaks,
multi-line paste and undo for free. Because the editor is split into many
boxes, each of those behaviours must be re-implemented by hand across box
boundaries. These six fixes are exactly that hand-work.

## What Enters

Six independent fixes, ordered safest-first:

1. **Delete note** from the "Notas" sidebar list.
2. **Ctrl/Cmd+F** opens search, seeded with the current text selection.
3. **Arrow Up/Down** move the caret between blocks, preserving the column.
4. **Shortcut change:** Ctrl/Cmd+Enter opens/edits the gray block note;
   Shift+Enter inserts a soft line break inside the same block.
5. **Multi-line paste** splits clipboard text into blocks, recognising bullets
   and todos.
6. **App-wide Undo/Redo** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) covering text and
   structural changes.

## What Does NOT Enter

- No rich-text editor engine (TipTap/Lexical/ProseMirror). Spec 015 stands.
- No continuous character-level selection across blocks (request #4). Selection
  stays block-level (whole renglones), as it is today.
- No Markdown/HTML paste parsing beyond plain-text line splitting with
  bullet/todo prefix detection. No nesting inference from indentation in v1.
- No drag-and-drop reordering (still tracked separately; keyboard move stays).

## Model Of Data Affected

- `blocks`: `content` may now contain `\n` (soft breaks). `type`, `checked`,
  `parentBlockId`, `order`, `collapsed` unchanged in shape.
- `notes`: soft delete via existing `softDeleteNote`.
- No schema/migration changes. Existing rows stay valid; a block with no `\n`
  behaves exactly as before.

---

## Fix 1 — Delete note in "Notas" list

**Problem:** Snippets and Etiquetas rows have a trash button; Notas rows do not.

**Behaviour:**
- Each note row in `NoteSidebar` gets a quiet trash button, same hover/focus
  reveal pattern as snippets/tags (`opacity-0 … group-hover/​focus-within`,
  `max-md:opacity-100` so it is always tappable on mobile).
- Click → `softDeleteNote(id)` via a new `onDeleteNote` prop wired in `+page`.
- After delete: remove from `notes` state; if the deleted note was current,
  select the next available note, or fall to the empty state if none remain.
- Toast: "Nota borrada". No hard confirm dialog in v1 (soft delete is
  recoverable; matches snippet/tag delete behaviour already shipped).

**Files:** `NoteSidebar.svelte`, `+page.svelte`, `storage/notes.ts` (already
has `softDeleteNote`).

## Fix 2 — Ctrl/Cmd+F opens search with the selection

**Problem:** Search opens on Ctrl/Cmd+K only; browser's native Find hijacks F.

**Behaviour:**
- In `+page` `handleShortcut`, add `(meta||ctrl) && key==='f'` →
  `preventDefault()` (override native Find) → open search.
- Capture `window.getSelection()?.toString()` at trigger time; pass it as a new
  `initialQuery` prop to `SearchDialog`.
- `SearchDialog` seeds `text = initialQuery ?? ''` on open (instead of always
  clearing), selects the text so the user can retype immediately.
- Ctrl/Cmd+K keeps working (empty query). Both routes share one dialog.

**Files:** `+page.svelte`, `SearchDialog.svelte`.

## Fix 3 — Arrow Up/Down between blocks, column-preserving

**Problem:** No caret navigation between blocks. Down at a block's last visual
line does nothing; the writer is stranded.

**Behaviour:**
- On `ArrowUp`/`ArrowDown` (no modifiers, no active multi-block selection, slash
  menu closed):
  - Reuse the existing `caretAtBlockEdge(direction)` logic: only act when the
    caret is on the block's first (up) or last (down) *visual* line. Otherwise
    let the browser move within the wrapped block.
  - At the edge: find the neighbour visible block (`neighborVisibleId`), focus
    its editable, and place the caret at the **same horizontal x** as the
    current caret, using `caretRangeFromPoint(x, targetY)` /
    `caretPositionFromPoint` with the neighbour's top (down) or bottom (up)
    line as targetY. Fall back to start/end if the point resolves outside.
- Nice-to-have (include if cheap): ArrowLeft at content start → end of previous
  block; ArrowRight at content end → start of next block. Column preservation
  only applies to up/down.

**Files:** `Editor.svelte` (owns block order + `caretAtBlockEdge`,
`neighborVisibleId`), `BlockRow.svelte` (forwards the key). A small pure helper
`caretColumnX(range)` and `placeCaretAtPoint(el, x, edge)` can live in a new
`editor/caret.ts` for testability where DOM-free logic exists.

## Fix 4 — Shortcut change: block note vs soft break

**Problem today:** Shift+Enter opens the gray block note. The user wants
Shift+Enter to be a soft line break, and the gray note on Ctrl/Cmd+Enter.

**Behaviour:**
- `Ctrl/Cmd+Enter` (not code, not separator) → `openNote()` (the existing gray
  secondary editor). This replaces the current Shift+Enter binding.
- `Shift+Enter` (not separator) → insert a literal `\n` at the caret inside the
  current block's content; do **not** create a new block. Code blocks already
  accept newlines; this makes text/bullet/todo behave the same.
- Plain `Enter` still creates a new block (unchanged).
- Rendering: text/bullet/todo editables get `whitespace-pre-wrap` so soft
  breaks show. The `el.textContent = block.content` sync already round-trips
  `\n` under `contenteditable="plaintext-only"`.
- Copy formatters: `formatPlainText` already splits text `content` on `\n`.
  Extend bullet/todo so an internal `\n` continues on a hanging-indented line
  rather than breaking the "- " prefix; HTML uses `<br>` for internal breaks.

**Files:** `BlockRow.svelte` (keydown + pre-wrap class), `copy/format.ts`
(bullet/todo multi-line handling), guide.

## Fix 5 — Multi-line paste → blocks

**Problem:** Pasting several lines dumps everything into one block.

**Decisions (confirmed with Hernan 2026-07-11):**
- **Blank lines are ignored** (compact output, no empty rows).
- **Recognise bullets and todos:** a line starting with `- `, `* `, or `• `
  becomes a bullet; `[ ] ` / `[x] ` (case-insensitive x) becomes a todo with
  its checked state; everything else is a text block.

**Internal round-trip (added 2026-07-11):** Copying inside CopyNotes must paste
back with **types, checked state, code and nesting intact** — not flattened to
text. The plain-text round-trip loses that (a todo renders as `- [ ] …`, code
has no marker, nesting is spaces). Fix: on copy, also write the real block
forest to CopyNotes' **own clipboard format** (`web application/x-copynotes+json`
via `ClipboardItem`), which survives the browser's HTML sanitisation (a hidden
HTML comment does not). On paste, if that format is present, rebuild the exact
blocks by reusing the snippet-insertion machinery (`planSnippetInsertion` over
each forest root). External paste has no such payload and falls back to the line
parser below. Pure serialize/deserialize in `copy/serialize.ts` under Vitest.

**Behaviour (external text):**
- Extension approved 2026-07-15: when the current block is empty and a
  conservative detector finds clear multi-line code signals, preserve the whole
  clipboard text as one `code` block. Prose, bullets, todos and uncertain input
  continue through the normal line parser below.
- Add a `paste` handler on the block editable. If the clipboard's plain text has
  **no** newline → let the browser paste inline (normal single-line paste).
- If it has newlines → `preventDefault`, then:
  - Split on `\n`, trim trailing `\r`, drop blank/whitespace-only lines.
  - Map each line to `{ type, content, checked? }` via a pure
    `parsePastedLines(text)` helper.
  - First parsed line's content is inserted at the caret of the current block
    (respecting existing text before/after the caret). Remaining lines become
    new sibling blocks inserted after it, in order, at the same depth/parent.
  - Focus lands at the end of the last inserted block.
- v1 ignores indentation → all pasted blocks share the current block's parent
  and are flat siblings.

**Files:** new `editor/paste.ts` (`parsePastedLines`, pure, Vitest-covered),
`BlockRow.svelte` (paste event), `Editor.svelte` (insert-many + persist +
focus), reusing block creation/ordering already in place.

## Fix 6 — App-wide Undo / Redo

**Problem:** No undo for structural actions; native undo only covers text within
one block and is lost across block boundaries. The user wants Ctrl+Z to undo
"todo".

**How Workflowy does it (researched 2026-07-11):** Workflowy's undo is
operation-based (each edit stored with an inverse), reusing the operation log it
already keeps for cross-device sync. Its exact internals are not published; this
is inferred from architecture plus their documented behaviour (Ctrl+Z undoes
text, move, delete, complete, indent across bullets; typing is grouped into
coarse steps; Ctrl+Shift+Z / Ctrl+Y redo).

**Decision (confirmed with Hernan 2026-07-11): snapshot-based now, operation-log
later.** An operation log is the "real" model and would double as the primitive
for future sync and the MCP agent audit/rollback that AGENT.md wants. But for
the MVP (Stage 7, Camino A, no over-engineering) snapshots are simpler, safer,
and cheap for small local notes. The pure `editor/history.ts` boundary keeps the
door open to swap in an operation log when sync/MCP make it pay off — without
touching the rest of the editor.

**Design — snapshot-based, per-note history:**
- Keep an in-memory `history` for the **current note**: a stack of snapshots.
  A snapshot = `$state.snapshot(blocks)` (the full ordered block list) plus the
  focused block id and caret offset. Small local notes make this cheap.
- Push a snapshot **before** each mutating action: enter, delete, indent/outdent,
  move, collapse toggle, checked toggle, type change, tag-driven content reset,
  snippet insertion, paste, and **text edits grouped by a short debounce** so a
  burst of typing is one undo step (not one per keystroke).
- Intercept `Ctrl/Cmd+Z` globally in `Editor`: `preventDefault` (so the browser
  does not also undo inside a box), pop the history, restore that snapshot to
  `blocks`, persist the diff to Dexie, and restore focus/caret.
- `Ctrl/Cmd+Shift+Z` (and `Ctrl+Y`) = redo, from a parallel redo stack that is
  cleared on any new action.
- History is **per note**: switching notes starts a fresh history (matches the
  user's mental model and avoids cross-note confusion). Cap at ~100 steps.
- Restore persistence: diff snapshot-vs-current to compute created/updated/
  soft-deleted blocks and apply through the storage layer, so IndexedDB matches
  what the user sees. This is the riskiest part → gets the most tests.

**Trade-off to accept:** text undo is *coarse* — it rewinds a burst of typing,
not each character. This is predictable and standard for block editors, and far
simpler/safer than replicating per-keystroke native undo.

**Files:** new `editor/history.ts` (pure snapshot/diff helpers, Vitest-covered),
`Editor.svelte` (wiring, key interception, persist-restore), guide.

---

## User Flows

- User hovers a note in the sidebar, clicks the trash, the note disappears and
  the next note opens.
- User selects a word, presses Ctrl+F, search opens with that word ready.
- User writes a long note, presses Down, the caret lands on the next bullet in
  the same column.
- User presses Shift+Enter to add a second line inside one bullet; presses
  Ctrl+Enter to attach a gray note.
- User copies a 5-line list from elsewhere, pastes into CopyNotes, and gets 5
  blocks with bullets and todos recognised.
- User indents a block, deletes another, types a sentence, then presses Ctrl+Z
  three times and each action is undone in reverse.

## Acceptance Criteria

- Deleting a note soft-deletes it, updates the list, and never leaves the app on
  a missing note.
- Ctrl/Cmd+F opens search with the selection and suppresses the browser's Find.
- Arrow Up/Down cross block boundaries only at the block's visual edge and keep
  the horizontal column; mid-block wrapped navigation is untouched.
- Shift+Enter adds a soft break inside a block; Ctrl/Cmd+Enter opens the gray
  note; plain Enter still makes a new block. Soft breaks survive reload and copy
  cleanly to plain text and HTML.
- Multi-line paste yields one block per non-empty line, with bullets and todos
  recognised; clearly detected code stays in one literal code block; single-line
  paste stays inline.
- Undo/Redo reverse and replay text and structural changes for the current note,
  persist correctly to storage, and restore focus. Switching notes resets
  history without corrupting either note.
- Inline formatting and headings also enter the history: they are applied through
  a single gate (`runFormatCommand` in `Editor.svelte`, shared by the floating
  toolbar and the keyboard shortcuts) that pushes one snapshot only when `html` or
  `type` actually change (a cancelled link creates no empty step). The incidental
  `input` event execCommand fires is ignored via a guard (synchronous per-block
  flag + content equality). See spec 020.
- No regression to nesting, collapse, todo cascade, slash, tags, copy, or
  snippet insertion.

## Minimum Tests

- Vitest: `parsePastedLines` (bullets, todos, blank-line stripping, plain text,
  single line vs multi).
- Vitest: history snapshot/diff helpers (create/update/soft-delete detection,
  redo clearing on new action, per-note isolation).
- Vitest: copy formatters with internal `\n` in text/bullet/todo.
- Component: Shift+Enter inserts `\n` without a new block; Ctrl+Enter opens the
  note; plain Enter still splits.
- Component: note delete removes the row and re-selects.
- Playwright (extend critical flow): paste a multi-line list → blocks; undo a
  structural change → reload → structure matches the undone state.

## Agent Notes

- Keep hierarchy/paste/history logic in pure modules (`editor/paste.ts`,
  `editor/history.ts`, `editor/caret.ts` where DOM-free) so the editor surface
  stays swappable, per specs 003/015.
- Per project rule, update `docs/guia-de-uso.md` in the **same commit** as each
  fix, in plain Spanish, and bump its "Última actualización" date.
- Build order = the six-item order above, each its own slice with approval
  between slices.
```
