# 004 - Copy And Formatters

## Objective

Make copying a first-class feature. Users should be able to copy blocks quickly, especially bullets and nested outlines, and paste them cleanly into other apps.

## What Enters

- Copy button visible on hover/focus.
- Copy menu or action for selected block.
- Copy selected block only.
- Copy selected block with children.
- Workflowy-like outline copy behavior.
- Clipboard formatter layer.
- Rich clipboard output where practical, including formatted HTML and plain fallback.
- Prepared support for Markdown and future formats.

## What Does NOT Enter

- No complicated export wizard inside copy action.
- No full document publishing.
- No custom clipboard format that only CopyNotes can understand.
- No dependence on internet.

## Model Of Data Affected

Copy uses:

- block content
- block type
- hierarchy
- order
- checked state for todos
- collapsed state only for UI, not for losing child data

## User Flows

- User hovers a block and sees a copy action.
- User copies only one block.
- User copies a parent bullet with children.
- User pastes into plain text app and gets readable indentation.
- User pastes into rich editor and gets useful formatted structure where supported.
- User copies code/snippet block without losing formatting basics.

## Acceptance Criteria

- Copy action does not require selecting text manually.
- Copy with children preserves outline structure.
- Plain text fallback always works.
- Formatter logic is testable without rendering the full editor.
- Future Markdown formatter can be added without rewriting editor behavior.
- Copy failures show a gentle UI message.

## Minimum Tests

- Vitest: format single text block.
- Vitest: format nested outline.
- Vitest: format todo checked/unchecked.
- Vitest: format code block.
- Component test: copy button appears on hover/focus.
- Playwright: copy nested outline and verify clipboard where browser support allows.

## Agent Notes

Think of copy as an output system, not as a button only. The clean design is: blocks go in, formatter output comes out, clipboard writes it.
