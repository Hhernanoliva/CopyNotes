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

## Acceptance Criteria

- Writing feels fast and does not require opening many panels.
- Nested blocks preserve hierarchy after reload.
- Drag and drop does not corrupt ordering or parent-child relationships.
- Collapse/expand hides and shows child blocks predictably.
- Slash command menu is discoverable and keyboard-friendly.
- The editor code is separated from pure block hierarchy logic.
- The app remains prepared to integrate TipTap, Lexical, or another editor later if needed.

## Minimum Tests

- Vitest tests for indent/outdent rules.
- Vitest tests for reorder rules.
- Vitest tests for collapse visibility helpers.
- Component test for slash command selection.
- Component test for todo checked/unchecked behavior.
- Playwright critical flow: create nested bullets, reload, verify structure.

## Agent Notes

Do not make block hierarchy depend on visual DOM order only. The hierarchy must be represented in data so export, search, copy, sync, and MCP can understand it later.
