# 003 - Editor And Blocks

## Objective

Build the core writing experience: notes made of blocks, with bullets, todos, code blocks, separators, nesting, keyboard behavior, drag and drop, and collapse/expand.

## What Enters

- Block editor UI.
- Block types: text, bullet, todo/check, code/snippet code, separator.
- Nested bullets similar to Workflowy.
- Keyboard interactions: Enter, Tab, Shift+Tab, Backspace behavior where needed.
- Slash commands: `/text`, `/bullet`, `/todo`, `/separator`, `/code`, `/snippet`.
- Collapse/expand for blocks with children.
- Drag and drop reordering.
- Focus and selection behavior good enough for daily writing.

## What Does NOT Enter

- No heavy editor library in MVP unless a later decision changes this.
- No complex rich text formatting in MVP.
- No database/table blocks.
- No multi-user editing.
- No AI writing assistant.

## Model Of Data Affected

This feature uses the `blocks` model heavily:

- `type`
- `content`
- `parentBlockId`
- `order`
- `collapsed`
- `checked`
- timestamps

## User Flows

- User creates a note and starts typing.
- Pressing Enter creates a new block.
- Pressing Tab indents a block under the previous valid block.
- Pressing Shift+Tab outdents a nested block.
- User creates a todo and checks/unchecks it.
- User creates a parent bullet with children and collapses it.
- User drags a block to reorder it.
- User uses `/` to change or insert block types.

## Nesting Applies To All Block Types

Tab/Shift+Tab nesting is type-agnostic: text, bullet, todo, and code blocks
can all be indented under the previous sibling, Workflowy-style. The first
block at any level cannot be indented because there is no previous sibling
to become its parent. This is intentional, not a bug.

## Enter On Empty Blocks — Double-Enter Escape (decided 2026-07-10)

Enter on an empty nested block outdents it one level instead of creating
another empty row. Repeated Enter presses climb one level each until the
block reaches the root, so "double Enter" exits a one-level nest and lets
the user start a new sibling structure (e.g. a second bullet with its own
children). Enter on an empty typed block (bullet/todo/code) already at
root cancels the type, mirroring the Backspace rule below. Enter on an
empty root text block inserts normally. Separators are exempt: Enter
there always inserts a row after the line.
Implemented in `enterOnEmptyAction` (src/lib/blocks/enter.ts).

## Backspace On Empty Blocks (decided 2026-07-10)

Workflowy-style two-step delete. Backspace on an empty typed block
(bullet, todo, code) first cancels the type: the row becomes a plain
text block and the caret stays on the same row, children untouched.
Backspace on an empty plain text row deletes the row and moves focus
to the previous visible block. Separators skip the convert step and
delete directly. Implemented in `backspaceAction` (src/lib/blocks/enter.ts).

## Todo Cascade (decided 2026-07-10)

When todos are nested under todos, checked state cascades both ways:

- Checking a parent todo checks all its todo descendants.
- Unchecking a parent todo unchecks all its todo descendants.
- When the last unchecked todo child becomes checked, the parent todo
  auto-checks.
- Unchecking any todo child auto-unchecks its parent todo (and that
  propagates upward).
- Only todo-type blocks participate. Non-todo children (text, bullets,
  code, separators) are ignored by the cascade, and a todo parent whose
  children are all non-todo blocks toggles manually only.
- Cascade changes persist like any other checked change.

Status: implemented 2026-07-10 in `src/lib/blocks/cascade.ts` as pure,
UI-independent logic with Vitest coverage.

## Literal Code Paste And Preview Collapse (decided 2026-07-15)

- Code blocks insert `text/plain` from the clipboard directly and read rendered
  text with `innerText`, preserving spaces, tabs, blank lines and line breaks.
- Code uses literal whitespace, tabs rendered at 4 spaces, and horizontal scroll
  instead of wrapping long lines.
- Code longer than 12 lines offers a separate preview collapse. Collapsed mode
  shows the first 6 lines and persists in `codeCollapsed`; it must not reuse the
  outline's `collapsed` field or hide nested child blocks.
- No syntax-highlighting or editor dependency is added.

## Acceptance Criteria

- Writing feels fast and does not require opening many panels.
- Nested blocks preserve hierarchy after reload.
- Drag and drop does not corrupt ordering or parent-child relationships.
- Collapse/expand hides and shows child blocks predictably.
- Slash command menu is discoverable and keyboard-friendly.
- Code paste preserves whitespace exactly and long-code preview collapse does
  not affect child visibility.
- The editor code is separated from pure block hierarchy logic.
- The app remains prepared to integrate TipTap, Lexical, or another editor later if needed.

## Minimum Tests

- Vitest tests for indent/outdent rules.
- Vitest tests for reorder rules.
- Vitest tests for collapse visibility helpers.
- Vitest tests for todo cascade rules (parent→children, children→parent,
  mixed-type children ignored).
- Component test for slash command selection.
- Component test for todo checked/unchecked behavior.
- Playwright critical flow: create nested bullets, reload, verify structure.

## Typed Triggers: The "Just Arrived" Test (decided 2026-07-31)

`/` (slash menu) and `#` (tag picker) are commands, not content. Both decide from
one `input` event whether the character the user just produced is a trigger. The
shared contract, implemented in `editor/slash.ts` (`nextSlashState`) and
`editor/triggers.ts` (`detectTrigger`):

- **Caret-aware, anywhere in the block.** The trigger fires mid-sentence, not only
  on an empty row. Both read `payload.caret` (plain-text offset after the edit,
  produced by `caretPlainOffset()` in `BlockRow.svelte`); with `caret == null`
  they fall back to the old start-of-block rule so the feature still works
  without selection info.
- **"Just arrived" = two checks, never length arithmetic.** The character sits at
  `caret - 1`; everything before it is unchanged (`text.slice(0, caret - 1) ===
  prevText.slice(0, caret - 1)`, which rejects pastes); and the same character
  was not already at that offset (`prevText[caret - 1] !== char`, which rejects a
  deletion that parks the caret behind an older `/` or `#`).
- **`#` additionally must stand alone**: nothing or whitespace before it, so
  `hola#` stays ordinary text. `/` has no such rule — it opens anywhere.

**Why prefixes and not `text.length === prevText.length + 1`:** emptying a row
leaves a browser-inserted `<br>` in the contenteditable, and `htmlToPlainText`
reads that as `"\n"`. A visually empty block therefore stores a phantom newline,
so any length delta computed against `prevText` is off by one and the trigger
silently stops firing on the very next keystroke. This shipped as a real bug in
the slash menu (fixed 2026-07-31, regression test in `e2e/slash.spec.ts`).
**Never do length arithmetic on `block.content` to infer what the user did.**

Consequence for anything that consumes the trigger character: it stays in the
text while the menu is open (nothing is deleted up front) and is cut out only
when a command is confirmed, via `strippedSlashFields(row, anchor, query)` — which
also handles the `#` case with an empty query. Cancelling therefore restores
nothing; the character was simply never removed.

## Agent Notes

Do not make block hierarchy depend on visual DOM order only. The hierarchy must be represented in data so export, search, copy, sync, and MCP can understand it later.

## Reordering Must Preserve Identity (from AGENT.md)

Any reorder mechanism (Alt+arrows today, drag and drop if added later) must preserve: nested child blocks, tags attached to moved blocks, todo checked state, and snippet identity when the moved block was saved as a snippet. Keep reordering logic separate from rendering so editor changes never force a rewrite of hierarchy operations.
