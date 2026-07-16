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

## Agent Notes

Do not make block hierarchy depend on visual DOM order only. The hierarchy must be represented in data so export, search, copy, sync, and MCP can understand it later.
