# 022 - Sidebar Organization: Manual Order, Folders, Snippet Rename

Approved by Hernan 2026-07-16 (design conversation). Builds in three
independent slices, each usable on its own:

- **Slice A — Snippet menu cleanup + inline rename** (small, no schema change)
- **Slice B — Manual order** (data model + drag & drop reorder)
- **Slice C — Folders** (UI on top of the Slice B data model)

## Objective

Give the user control over how saved things are arranged in the sidebar:
drag items into the order they want, group notes and snippets into folders,
rename a snippet with a click, and remove the two snippet-row buttons that
earn no keep ("Insertar en la nota", "Etiquetar snippet").

Approved design decisions:

- Manual order applies to **Notas, Snippets and Etiquetas**. Agenda stays
  auto-grouped by date.
- Folders exist in **Notas and Snippets only**, one level deep (no folders
  inside folders). Etiquetas get manual order but no folders.
- Reorder gesture is **drag & drop** (pointer-based). Mouse: press + move
  past a small threshold. Touch: long-press to lift, so scrolling stays
  free.
- Rename gesture is **click on the name** (snippets and folders). Click and
  drag never conflict: no movement = click, movement = drag.
- Manual order **replaces** the automatic orders (notes/snippets: updatedAt
  desc; tags: alphabetical). New items enter at the **top** of the root
  list. Sidebar snippets stop floating favorites first; the `/` menu keeps
  favorites first (unchanged).

## What Enters

### Slice A — Snippet menu cleanup + inline rename

- Remove the "Insertar en la nota" and "Etiquetar snippet" buttons from the
  snippet rows in `NoteSidebar.svelte`. Rows keep: favorite star, delete.
  Snippets are inserted via the `/` menu in the note (already works).
- Stop rendering snippet tag chips and the snippet `TagPicker` in the
  sidebar. Tag **data** is untouched (tagAssignments stay in storage and in
  backups); this is UI removal only.
- Click on a snippet's name turns it into an inline text input (same
  pattern as tag rename today): Enter or blur saves, Escape cancels, empty
  or unchanged input keeps the old name. Saving updates `snippet.name` via
  `updateSnippet`.
- The quick-save flow (block bookmark) keeps auto-naming from the first
  words; the user now fixes the name with one click. The "+ Nuevo snippet"
  dialog already has an optional name field — unchanged.

### Slice B — Manual order (drag & drop)

- New pure-logic module **`src/lib/organize/`**: reorder/move plans over
  `{id, sortOrder, folderId}` rows (node-tested, no DOM). Same philosophy
  as `src/lib/blocks/`: UI applies plans, never invents order math.
- Ordering model: **gapless integers per container** (container = root list
  or one folder; tags have only root). Every mutation renumbers its
  container(s); lists are small, renumbering is cheap and keeps invariants
  trivial.
- The root container is one sequence over the **union of folders and loose
  items** (folders intermix with notes/snippets, per Slice C): one shared
  `sortOrder` sequence per kind, folder or not. A folder's contents form
  their own container keyed by `folderId`.
- Drag & drop in the sidebar lists (notes, snippets, tags):
  - Pointer-events based (works for mouse and touch from one code path).
  - Mouse/pen: drag starts after ~5px of movement. Touch: drag starts
    after a ~500ms long-press; before that, the gesture scrolls the list.
  - While dragging: the lifted row follows the pointer, a drop indicator
    line shows the insertion point.
  - Drop between two items reorders within the container. (Folder targets
    arrive with Slice C.)
  - Escape or dropping outside any list cancels the drag.
- New items (`createNote`, `createSnippet`, `createTag`) enter at
  `sortOrder 0` of the root, shifting the rest down.

### Slice C — Folders (Notas and Snippets)

- The **+** button in the notes and snippets tabs opens a two-option menu:
  "Nueva nota / Nueva carpeta" ("Nuevo snippet / Nueva carpeta"). A new
  folder is created at the top of the root list with its name already in
  edit mode.
- Folder row: chevron (collapsed/expanded) + name + item count. Click on
  the row toggles collapse; click on the **name** renames (inline input,
  same rules as snippets). Collapse state persists on the folder record.
- Folders and loose items intermix freely in the root list; folder
  contents indent one level. One level only: a folder can never enter
  another folder (drops that would nest are rejected visually).
- Drag interactions: drop **onto** a folder row (highlighted) files the
  item inside, at the top; works on collapsed folders too. Drag an item
  out of a folder to any root position to unfile it.
- Delete folder (trash button on hover, confirm like note delete): the
  folder soft-deletes, its contents **move to the root at the folder's
  old position**, in their internal order. Nothing else is deleted.
- Empty folders are allowed and survive reloads and backups.
- Deleting a note/snippet inside a folder just renumbers that folder.

## What Does Not Enter (deliberate, do not sneak in)

- Folders in Etiquetas or Agenda.
- Nested folders (folder inside folder).
- Keyboard-based reorder of sidebar items (future; blocks keep Alt+↑/↓
  inside the editor — unrelated).
- Re-adding snippet tagging UI elsewhere (data stays; UI is gone).
- Renaming notes from the sidebar (notes are named by their title in the
  editor; a sidebar click opens the note).
- Drag & drop of blocks inside the editor (this spec is sidebar-only).
- Moving items between kinds (a note can never enter a snippet folder).

## Model of Data Affected

New Dexie table **folders** (schema v5):

```json
{
  "id": "…",
  "kind": "note",
  "name": "Trabajo",
  "sortOrder": 0,
  "collapsed": false,
  "createdAt": "…",
  "updatedAt": "…",
  "deletedAt": null
}
```

- `kind`: `"note"` | `"snippet"`. Store declaration: `'id, kind'`.

New **optional** fields on existing records:

- notes / snippets: `sortOrder` (integer ≥ 0), `folderId` (string id or
  `null` = root).
- tags: `sortOrder` only.
- No new indexes on existing tables (lists load whole tables already);
  schema strings stay as they are — records simply carry the new fields.

Dexie v5 upgrade body assigns initial `sortOrder` from today's visible
orders: notes and snippets by `updatedAt` desc, tags alphabetical;
`folderId` starts `null`. After the upgrade the repositories sort by
`(folderId, sortOrder)` and **never** by `updatedAt` again for lists.
Rows missing `sortOrder` at read time (safety net) sink to the end.

Backup (spec 018): `formatVersion` bumps to **4**,
`SUPPORTED_VERSIONS = [1, 2, 3, 4]`. v4 adds the `folders` array and the
optional `sortOrder`/`folderId` fields on notes, snippets and tags. The
validator accepts them well-formed and **drops malformed values** (negative
or non-integer `sortOrder`, `folderId` pointing at a missing or
wrong-kind folder ⇒ field dropped, item lands at root; never reject the
whole backup for it). Older backups (v1–v3) import with no folders and get
sortOrder assigned like the Dexie upgrade. Update spec 018 in the same
commit. The whole schema + backup work lands **once, in Slice B** (the
folders table ships empty until Slice C builds its UI).

Snippets-export format: unchanged (content-only, stays v1). Folder
membership does not travel with individual snippet exports.

## User Flows

1. **Reorder**: grab "Ideas" in Notas, drag two rows up, drop. Order
   survives reload and backup roundtrip. Editing a note no longer moves it.
2. **Rename a snippet**: click its name → type "Respuesta de bienvenida" →
   Enter. The `/` menu shows the new name immediately.
3. **File into a folder**: + → Nueva carpeta → name it "Clientes" → drag
   three snippets onto it → collapse it. Reload: still collapsed, count 3.
4. **Unfile**: expand, drag one snippet out to the root list.
5. **Delete folder**: trash on "Clientes" → confirm → its snippets
   reappear at the folder's old spot; nothing lost.
6. **Backup roundtrip**: export → import (replace-all) → same order, same
   folders, same collapse states.

## Acceptance Criteria

- Snippet rows show only star + delete; no tag chips, no tag picker, no
  insert button. `/` menu still inserts snippets, favorites first.
- Click-rename works on snippets and folders: Enter/blur saves, Escape
  cancels, empty keeps old name; a drag that moved never opens rename.
- Drag reorder works in Notas, Snippets, Etiquetas with mouse; long-press
  drag on touch; plain touch swipe still scrolls the list.
- Orders are gapless integers per container after every operation
  (reorder, file, unfile, create, delete, folder delete, import).
- New note/snippet/tag/folder appears at the top of the root list.
- Folders: one level enforced; collapse state, order and membership
  survive reload and backup export → import (merge and replace-all).
- Folder delete moves contents to root at the folder's position.
- Dexie upgrade from a v4 (spec 021) database preserves today's visible
  order as the initial manual order.
- Malformed `sortOrder`/`folderId` in an imported backup never crashes the
  import: field dropped, item lands at root.
- Everything reachable on mobile (long-press drag, tap rename).

## Minimum Tests

- `src/lib/organize/` (node): reorder within container; move between
  containers (root↔folder); insert-at-top on create; folder-delete
  contents relocation; gapless renumber after each; plans reject nesting
  a folder into a folder.
- Storage: Dexie v5 upgrade test (seed pre-022 rows → upgrade → sortOrder
  matches old visible order; scratchpad `verify-migration` pattern).
  Repository list functions sort by `(folderId, sortOrder)`.
- Backup: v4 roundtrip with folders + orders; v3 import gets sortOrder
  assigned; malformed `sortOrder`/`folderId` dropped without rejecting;
  replace-all and merge both covered.
- Snippet rename: `updateSnippet` name change reflected in `/` menu list
  (filter.ts unaffected by rename).
- e2e: (A) rename snippet via click → Enter → survives reload; snippet row
  has no insert/tag buttons. (B) drag a note above another (mouse) →
  order survives reload. (C) create folder → drag snippet in → collapse →
  reload keeps all → delete folder → snippet back at root.

## Agent Map (read before touching sidebar organization)

| Concern | Where |
| --- | --- |
| Order/move/folder plans (pure) | `src/lib/organize/` (node-tested, no DOM) |
| Drag & drop gesture | one shared Svelte attachment/component used by the three sidebar lists (`NoteSidebar.svelte` area) |
| Folder storage | `src/lib/storage/folders.ts` (new repo, soft-delete like notes) |
| sortOrder assignment on create/upgrade | `src/lib/storage/` repos + `db.ts` v5 upgrade |
| Backup schema + versions | `src/lib/export-import/schema.ts` (+ spec 018 update) |
| Rename UI pattern | inline input, copy the tag-rename pattern already in `NoteSidebar.svelte` |

Hard-won rules that apply here:

- Structural changes (order, folderId, rename, collapse) persist
  **immediately** through storage — never debounced (persistence model:
  IDB writes die on unload).
- `$state.snapshot(...)` before handing reactive rows to Dexie writes.
- Backup import passes through the validator in `schema.ts`; any new field
  must be explicitly accepted and validated there (same contract style as
  `dueDate` in spec 021 — but note: `folderId`/`sortOrder` are **not**
  block fields, the `format/ingest.ts` gate is not involved).
- e2e: wait ~150ms after any focus-moving action before typing; drag via
  `page.mouse` move sequences (Playwright's `dragAndDrop` may not trip the
  5px threshold logic — move in steps).

## Agent Notes

- Read `specs/018-backup-json-format.md` before the backup change and
  `specs/005-snippets.md` for what snippets already promise.
- `filterSnippets` (favorites-first) remains the ordering for the `/` menu
  only; the sidebar reads the manual order. Keep the two paths visibly
  separate so neither "fixes" the other.
- The sidebar currently receives plain arrays from `+page.svelte`; keep it
  that way — plans run in the page (which owns storage calls), the sidebar
  emits intents (`onReorder`, `onFile`, `onRenameSnippet`, …).
- User guide: each slice updates `docs/guia/` in the implementing commit
  (sidebar topic + snippets topic), plain Spanish, index date bumped.
