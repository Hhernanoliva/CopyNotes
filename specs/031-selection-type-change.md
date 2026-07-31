# 031 - Cambiar el tipo de varios renglones a la vez ("/" sobre la selección)

Created: 2026-07-31. Approved by Hernan 2026-07-31 (design reviewed in chat:
disparador = tecla `/` sobre la selección, reusando el menú existente; solo
comandos de tipo; se convierte exactamente lo que está pintado).

## Objective

When several rows are selected, pressing **`/`** opens the familiar slash menu
applied to the **whole group**, so a pasted list of bullets becomes a list of
tasks in one gesture instead of one row at a time.

The motivating case: the user pastes bullets copied from somewhere else and
needs them to be tasks. Converting row by row is the pain this removes.

## What enters

- **Trigger.** With a multi-row selection active (`hasSelection`), a bare `/`
  keydown is claimed by `handleSelectionKeys` in `Editor.svelte` and opens the
  group menu. The character is **never inserted into any block**.
- **Menu.** The existing `SlashMenu.svelte`, anchored to the selection's focus
  row (`selection.focusId`), with a header line: **"Convertir N renglones en…"**.
- **Commands: type changes only** — `Texto`, `Título 1`, `Título 2`, `Título 3`,
  `Viñeta`, `Tarea`, `Código`.
- **Keyboard while the menu is open** (all claimed by `handleSelectionKeys`,
  which runs in the capture phase and therefore precedes every other branch):
  - `↑` / `↓` move the highlighted command.
  - `Enter` / `Tab` apply it.
  - `Escape` closes the menu, touches nothing, and **leaves the selection alive**.
  - Click on an item applies it too.
- **Applying a type to the group:**
  - One `recordSnapshot()` before any write, so a single `Ctrl/Cmd+Z` undoes the
    whole group change.
  - Rows are written in visible order through `planTypeChangeSelection`.
  - Rows becoming `todo` go through `convertToTask({ blockId, checked })` — the
    single door that also writes the `created` activity line the agent reads.
    Every other type goes through `updateBlock` with the planner's changes.
  - After applying: menu closes, **the selection stays marked**, focus returns to
    `selection.focusId`.
- **Guide.** `docs/guia/06-seleccionar-deshacer-colapsar.md` (selection actions)
  and a pointer from `docs/guia/02-notas-y-tipos-de-renglon.md`, in the same
  commit as the code.

## What does not enter

- **`Fecha`, `Separador`, `Snippet` in the group menu.** A group date would need
  the date panel wired to N rows; `Separador` would destroy the text of every
  selected row; `Snippet` is a save action, not a type. Single-row `/` keeps all
  three, unchanged.
- **Touching the typed-`/` flow.** The group menu uses its own state
  (`selectionMenu`), separate from `slash`. `nextSlashState`, `detectTrigger` and
  `strippedSlashFields` are not modified and not called: nothing was typed into a
  block, so there is nothing to strip. The typed-trigger contract in spec 003
  does not apply to this path.
- **A floating action bar over the selection**, and any new toolbar. Considered
  and dropped: a new component that must not collide with
  `FloatingFormattingToolbar`, for a gesture `/` already covers.
- **A dedicated keyboard shortcut** (e.g. `Ctrl+Shift+Enter`). `/` is the gesture
  the user already knows; a second, invisible one adds surface for nothing.
- **Touch support for the gesture.** Multi-row selection is mouse+keyboard today
  (`pointerenter` with `buttons & 1`, `Shift+↑/↓`); there is no touch multi-select
  to hang this off. No change on phones.

## Model of data affected

No schema change. Existing block fields only:

- `type` — the new type for every convertible selected row.
- `checked` — set by `planBlockType`'s existing rule: a row that was already a
  task keeps its tick when re-converted to `Tarea`; a row that was not a task is
  born unticked. Leaving `Tarea` clears it exactly as the single-row path does.
- `content` / `html` — **untouched**. This is a type change, not a text edit.

Activity (agent journal): one `created` line per row that becomes a task, written
by `convertToTask`. No activity for the other types, matching the single-row path.

### `planTypeChangeSelection(blocks, selectedIds, type)`

New pure function in `src/lib/blocks/selection.ts`, alongside the existing
`planIndentSelection` / `planMoveSelection` / `planDeleteSelection`. Returns
`{ updates: [{ id, changes }] }` in visible order, where `changes` comes from
`planBlockType(row, type)`. Rules:

- **Separators are skipped** — never converted, never written.
- A row already of the target type still gets its planner changes applied
  (idempotent, no special case).
- **Only the rows in `selectedIds` are planned.** Descendants are not added.
  Unlike delete — which pulls children in so nothing is orphaned — a type change
  cannot orphan anything, so the rule is "what you see marked is what changes".
  A row whose children are collapsed (hidden) therefore converts alone.
- Returns `null` when nothing is convertible (e.g. a selection of separators),
  so the caller can no-op without recording a snapshot.

## User flows

**Bullets pasted from elsewhere → tasks**

1. User pastes 5 bullets into a note.
2. Marks them: drag with the mouse, or `Shift+↓` four times.
3. Presses `/`. The menu opens under the focus row: "Convertir 5 renglones en…".
4. `↓` to `Tarea`, `Enter`.
5. The 5 rows become unticked tasks. The selection is still marked.
6. `Ctrl/Cmd+Z` once puts all 5 back to bullets.

**Cancel**

1. Selection marked, `/` pressed by mistake.
2. `Escape`. Menu closes, no row changed, the selection is still marked and
   `Alt+↓`, `Tab`, `Cmd+C` keep working on it.

**Mixed selection**

1. Selection covers 2 bullets, 1 separator and 1 task that is already ticked.
2. `/` → `Tarea`. The 2 bullets become unticked tasks, the ticked task keeps its
   tick, the separator is untouched.

## Acceptance criteria

- With a multi-row selection, `/` opens the group menu and **no block's text
  gains a `/` character**.
- The group menu lists exactly: Texto, Título 1, Título 2, Título 3, Viñeta,
  Tarea, Código.
- The header shows the real count of selected rows.
- `Enter`/`Tab`/click applies to every selected row; `↑`/`↓` navigate; `Escape`
  closes without writing.
- After applying, the selection is still marked and the focus row still focused,
  so a follow-up `Tab` / `Alt+↓` / `Cmd+C` acts on the same group.
- One `Ctrl/Cmd+Z` reverts the whole group change.
- Converting to `Tarea` produces one `created` activity line per new task
  (agent parity with `/todo` on a single row).
- Separators inside the selection are never modified.
- Without a selection, `/` behaves exactly as before (typed trigger, single row).

## Minimum tests

**Unit — `src/lib/blocks/selection.test.ts`**

- `planTypeChangeSelection` skips separators.
- Converts bullets and text rows to `todo` with `checked: false`.
- A row already ticked keeps `checked: true` when re-converted to `todo`.
- Returns `null` when the selection has nothing convertible.
- Only planned ids are the selected ones (a selected parent with unselected
  children plans one update, not three).

**Unit — `src/lib/tasks/actions.test.ts`** (existing file)

- Already covers `convertToTask` writing the `created` line; no new case needed
  beyond confirming the group path calls it once per row.

**e2e — `e2e/slash.spec.ts`**

- Three bullets, select them with `Shift+↓`, press `/`, choose `Tarea`: three
  checkboxes appear, no `/` in any row's text, and one `Ctrl+Z` restores the
  three bullets.

## Agent notes

- `convertToTask` stays the single door for task creation. The group path must
  not write `type: 'todo'` through `updateBlock` directly, or the agent's journal
  loses the `created` lines.
- Every key that must act on the group needs its own branch in
  `handleSelectionKeys`; a key without one silently falls through to the focused
  row and acts on **one** block (the bug that made `Tab` indent only the first
  selected row, fixed 2026-07-31).
- The group menu's `↑`/`↓`/`Enter`/`Tab`/`Escape` branches must sit **before**
  the existing selection branches, otherwise `Tab` indents and `Escape` clears
  the selection while the menu is open.
