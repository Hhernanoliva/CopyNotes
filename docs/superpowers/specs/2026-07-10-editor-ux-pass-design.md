# Editor UX Pass — Design

Date: 2026-07-10. Approved by Hernan before implementation.

A batch of editor refinements requested by Hernan, sitting between Stage 6 (done) and Stage 7. It refines editor UX and adds two features (block notes, multi-block selection). Stays within editor product scope (spec 003 territory); does not widen the product.

## Slices

Shipped as three approved slices, verified in the real app between each.

### Slice A — quick UX wins (low risk)

1. **Faster tooltips.** The native `title` attribute delays ~1s and is not configurable. Replace with a small custom tooltip (Svelte action or component) using Quiet Ink tokens, showing after ~250ms on hover and on keyboard focus, hiding on leave/blur. Applied to the icon buttons. `aria-label` stays the source of truth for assistive tech; the tooltip is visual sugar.
2. **Note-title tag control.** Move the `+ etiqueta` text button out from under the title. Make it a tag icon button beside the title (appears on hover/focus), consistent with the block tag icon. Note tag chips still render below the title when present.
3. **Line buttons → copy + kebab.** On block hover/focus keep exactly two controls: **Copy** (visible, as today) and a **⋯ (3-dots)** button. The kebab opens a small menu with every other action: Copy with children, Save as snippet, Tag — each showing its quick key when it has one.
4. **Typed triggers (quick keys).** Preference: typed triggers, not Cmd/Ctrl combos.
   - Bullet: `- ` already converts a text block at line start; add `* ` as an alternative.
   - Tag: typing `#` opens the tag picker anchored to the block; the `#` is a trigger, not inserted; picking assigns the tag.
   - Save snippet: no natural typed trigger. Stays a kebab click, no dedicated key (adding a lone combo would contradict the typed-trigger direction). Hernan can revisit.

### Slice B — block notes (Workflowy-style)

Shift+Enter adds/edits a secondary **note**: gray, smaller text attached under the block content.

- Data model: blocks gain an optional `note` string (default `''`). Backup schema (`018`) already uses loose objects so old backups load; add `note` to the schema and to the snippet snapshot.
- Behavior: Shift+Enter on text/bullet/todo focuses (creating if absent) the note editor. **Exception:** in `code` blocks Shift+Enter keeps inserting a newline (code is inherently multi-line). Backspace on an empty note removes it and returns focus to the block.
- Rendering: a second `plaintext-only` contenteditable under the main content, muted-foreground, smaller.
- Propagation: copy formatters include the note as a sub-line (plain + HTML); Markdown/HTML export include it.

### Slice C — multi-block selection (largest, riskiest)

Select several blocks and copy / delete / move them as a group.

- Selection is block-level (a set of block ids in Editor state), not free cross-block text selection, because each block is its own `plaintext-only` region.
- Enter selection: **Shift+Click** selects the range between the active block and the clicked block in visible order; **Shift+ArrowUp/Down** extends by one block. Clicking a block or typing clears the selection.
- Visual: selected blocks get a soft highlight background.
- Operations: **Copy** (Cmd/Ctrl+C) copies all selected as an outline preserving levels; **Delete** (Backspace/Delete) soft-deletes the selection plus descendants (never orphan children); **Move** (Alt+ArrowUp/Down) moves the whole group among siblings.
- Hierarchy integrity is the risk. All selection→operation logic is pure and TDD'd in `src/lib/blocks/` (e.g. `selection.ts`), separate from rendering, so it can be tested without the editor.

## Non-goals

- No Cmd/Ctrl combo scheme (typed triggers chosen).
- No free cross-block text selection (out of scope for the custom block editor).
- No snippet-save hotkey (kebab click only).
- No change to existing copy/slash/nesting behavior beyond what each slice states.

## Testing

Pure logic (typed triggers, note actions, selection/move/delete plans, copy formatting with notes) under Vitest first. Each slice verified end-to-end in the running app with Playwright, plus regression runs of the existing snippet/tag/search suites.
