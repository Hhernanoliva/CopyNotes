# Sidebar Organization Implementation Plan (spec 022)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manual drag & drop ordering for the sidebar lists (Notas, Snippets, Etiquetas), one-level folders for Notas and Snippets, click-to-rename for snippets and folders, and removal of the snippet-row "Insertar en la nota" / "Etiquetar snippet" buttons.

**Architecture:** Pure order/move planning lives in a new `src/lib/organize/` module (node-tested, mirrors `src/lib/blocks/`). Storage grows a `folders` table (Dexie v5) plus `sortOrder`/`folderId` fields; the backup format bumps to v4. One shared pointer-based drag attachment serves the three sidebar lists. The page owns storage calls; `NoteSidebar.svelte` emits intents.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie (IndexedDB), Valibot (backup schema), Vitest (`server` project = node with fake-indexeddb for storage; NO jsdom for `src/lib/organize/` or `src/lib/components/`), Playwright e2e.

## Global Constraints

- Hand-written code is **plain JavaScript inside `.ts`/`.svelte` files — no type annotations** (project rule).
- Svelte 5 runes only. Never `onMount`; use `$effect`/`{@attach}`. `$derived` for values, `$effect` for outside-world actions. Cleanup functions from every `$effect`/attachment that subscribes or listens.
- `$state.snapshot(...)` before handing reactive objects to Dexie.
- Structural changes (order, folderId, rename, collapse) persist **immediately** — never debounced.
- All user-facing copy in plain Spanish (es-AR voseo, matching existing strings).
- Every user-visible change updates `docs/guia/` **in the same commit** (topic file + "Última actualización" date in `docs/guia-de-uso.md`).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run unit tests with `pnpm test` (full) or `pnpm vitest run <path>` (single file). e2e: `pnpm test:e2e` (builds first; needs port 4173 free). Type check: `pnpm check`.
- e2e rule: wait `await page.waitForTimeout(150)` after any focus-moving action before typing.
- Branch: work happens on `feat/organizar-guardados` (already exists, spec committed).

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/organize/plans.ts` (new) | Pure sidebar order math: sort, initial assignment, reorder, insert-at-top, cross-container move, folder-delete relocation, tree building |
| `src/lib/organize/index.ts` (new) | Re-exports |
| `src/lib/organize/plans.test.ts` (new) | Node tests for the above |
| `src/lib/storage/db.ts` | Dexie v5: `folders` table + sortOrder migration |
| `src/lib/storage/folders.ts` (new) | Folders repository (soft-delete, like notes) |
| `src/lib/storage/organize.ts` (new) | `shiftRootDown`, `applySidebarUpdates`, `ensureSidebarOrder` |
| `src/lib/storage/notes.ts` / `snippets.ts` / `tags.ts` | Create-at-top + sortOrder-based list sorting |
| `src/lib/storage/backup.ts`, `src/lib/export-import/{schema,merge,backup}.ts` | Backup v4: folders table + organization fields |
| `src/lib/components/dnd.ts` (new) | `insertionIndex`/`dropTarget` (pure) + `sidebarDragList` attachment |
| `src/lib/components/NoteSidebar.svelte` | Row cleanup, inline rename, folder rows, drag wiring |
| `src/routes/+page.svelte` | Folders state, drop/rename/create handlers |
| `specs/018-backup-json-format.md` | v4 documentation |
| `docs/guia/08-snippets.md`, `docs/guia/13-ordenar-y-carpetas.md` (new), `docs/guia-de-uso.md` | User guide |

Slices (spec 022): **A** = Tasks 1–2, **B** = Tasks 3–7, **C** = Tasks 8–10. Each slice ends usable.

---

### Task 1: Snippet row cleanup (Slice A)

**Files:**
- Modify: `src/lib/components/NoteSidebar.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `docs/guia/08-snippets.md`, `docs/guia-de-uso.md`

**Interfaces:**
- Produces: `NoteSidebar` no longer takes `snippetTags`, `onInsertSnippet`, `onSnippetTagPick`, `onSnippetUntag`. Snippet rows keep star + delete only.

- [ ] **Step 1: Strip the two buttons, chips and picker from `NoteSidebar.svelte`**

In the snippets `{#each}` block, delete the whole "Insertar en la nota" `<button>`, the whole "Etiquetar snippet" `<button>`, the `{#if (snippetTags[snippet.id] ?? []).length > 0}` chips block, and the `{#if tagPickerSnippetId === snippet.id}` TagPicker block. Then remove now-dead code: the `tagPickerSnippetId` state, the `TagPicker`/`TagChips` imports **only if** no other usage remains in the file (TagChips/TagPicker are still used nowhere else in this file after the removal — delete both imports), the `ArrowDownToLine` icon import, and the `snippetTags = {}`, `onInsertSnippet`, `onSnippetTagPick`, `onSnippetUntag` props.

- [ ] **Step 2: Remove the dead wiring in `+page.svelte`**

Delete functions `insertSnippet`, `snippetTagPick`, `snippetUntag`, the `snippetTagsMap` state, and in `refreshTags()` keep only `tags = await listTags();` (drop the `listTagsForMany('snippet', …)` call — the editor has its own tag loading; verify with `grep -n snippetTagsMap src/routes/+page.svelte` → no hits left). Remove `snippetTags={snippetTagsMap}`, `onInsertSnippet={insertSnippet}`, `onSnippetTagPick={snippetTagPick}`, `onSnippetUntag={snippetUntag}` from the `<NoteSidebar>` call. Remove `assignTag`, `unassignTag`, `listTagsForMany` from the `$lib/storage` import if now unused in this file (check with grep first; `findOrCreateTag` stays for `createTagFromSidebar`).

- [ ] **Step 3: Verify**

Run: `pnpm check` → 0 errors, 0 warnings. Run: `pnpm test` → all pass (no unit test touches these buttons). Run: `pnpm test:e2e` → all pass (`critical-flows.spec.ts` saves a snippet and looks at the Snippets view but never clicks the removed buttons).

- [ ] **Step 4: Guide + commit**

In `docs/guia/08-snippets.md`: find the section describing the snippet library buttons and rewrite it so the row actions are only **favorito (estrella)** and **borrar (tacho)**; state that snippets are inserted from the note with `/` (write it in the file's existing voice); remove any mention of etiquetar snippets desde la barra. Update the "Última actualización" date in `docs/guia-de-uso.md` to today. Commit:

```bash
git add -A
git commit -m "feat(sidebar): snippet rows keep only star and delete (spec 022 slice A)

Insert-from-sidebar and snippet tagging UI removed; snippets are inserted
via the / menu. Tag data untouched.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Inline snippet rename (Slice A)

**Files:**
- Modify: `src/lib/components/NoteSidebar.svelte`
- Modify: `src/routes/+page.svelte`
- Create: `e2e/sidebar-organization.spec.ts`
- Modify: `docs/guia/08-snippets.md`, `docs/guia-de-uso.md`

**Interfaces:**
- Produces: `NoteSidebar` prop `onRenameSnippet(snippet, name)`; snippet name button with `aria-label="Renombrar snippet {snippet.name}"`. Task 7's drag code must NOT break this click (click = no movement).

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/sidebar-organization.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Spec 022: sidebar organization. Slice A: click a snippet's name to rename it.

test('click on a snippet name renames it and the name survives a reload', async ({ page }) => {
	await page.goto('/');
	// Seed a snippet through the + dialog (name auto-derives from the text).
	await page.getByRole('button', { name: 'Snippets' }).click();
	await page.getByRole('button', { name: 'Nuevo snippet' }).click();
	await page.getByLabel('Texto').fill('Hola, gracias por escribirnos');
	await page.getByRole('button', { name: 'Guardar snippet' }).click();
	await expect(page.getByText('Snippet guardado')).toBeVisible();

	// Click the name → inline input appears pre-filled.
	await page.getByRole('button', { name: 'Renombrar snippet Hola, gracias por escribirnos' }).click();
	const input = page.getByLabel('Nuevo nombre del snippet');
	await expect(input).toBeVisible();
	await input.fill('Bienvenida');
	await input.press('Enter');
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();

	// Escape cancels without saving.
	await page.getByRole('button', { name: 'Renombrar snippet Bienvenida' }).click();
	await page.getByLabel('Nuevo nombre del snippet').fill('Otro nombre');
	await page.getByLabel('Nuevo nombre del snippet').press('Escape');
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Snippets' }).click();
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:e2e -- sidebar-organization` → FAIL (no accessible button named `Renombrar snippet …`).

- [ ] **Step 3: Implement the inline rename**

`NoteSidebar.svelte` — add state + handlers next to the tag-rename ones (same pattern):

```js
let editingSnippetId = $state(null);
let editingSnippetValue = $state('');

function startSnippetRename(snippet) {
	editingSnippetId = snippet.id;
	editingSnippetValue = snippet.name;
}

async function submitSnippetRename(snippet) {
	const value = editingSnippetValue;
	editingSnippetId = null;
	if (value.trim() && value.trim() !== snippet.name) await onRenameSnippet(snippet, value.trim());
}
```

Add `onRenameSnippet` to the `$props()` destructuring. In the snippet row, replace the name block

```svelte
<div class="min-w-0 flex-1">
	<p class="truncate text-sm">{snippet.name}</p>
	…
</div>
```

with:

```svelte
<div class="min-w-0 flex-1">
	{#if editingSnippetId === snippet.id}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				submitSnippetRename(snippet);
			}}
		>
			<!-- svelte-ignore a11y_autofocus — the user just chose to rename. -->
			<input
				bind:value={editingSnippetValue}
				aria-label="Nuevo nombre del snippet"
				autocomplete="off"
				autofocus
				onkeydown={(event) => {
					if (event.key === 'Escape') editingSnippetId = null;
				}}
				onblur={() => submitSnippetRename(snippet)}
				class="border-border focus-visible:ring-ring min-h-7 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
			/>
		</form>
	{:else}
		<button
			type="button"
			aria-label="Renombrar snippet {snippet.name}"
			title="Renombrar"
			onclick={() => startSnippetRename(snippet)}
			class="focus-visible:ring-ring block w-full rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
		>
			<p class="truncate text-sm">{snippet.name}</p>
			{#if firstLine(snippet.content) && firstLine(snippet.content) !== snippet.name}
				<p class="text-faint truncate text-xs">{firstLine(snippet.content)}</p>
			{/if}
		</button>
	{/if}
</div>
```

Note `onblur` submits (same as Enter) and Escape sets `editingSnippetId = null` BEFORE blur fires, so Escape wins — this matches the test. `+page.svelte` — handler + wiring:

```js
async function renameSnippetFromSidebar(snippet, name) {
	await updateSnippet(snippet.id, { name });
	await refreshSnippets();
}
```

and `onRenameSnippet={renameSnippetFromSidebar}` on `<NoteSidebar>`.

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm test:e2e -- sidebar-organization` → PASS. Run `pnpm check` → clean.

- [ ] **Step 5: Guide + commit**

`docs/guia/08-snippets.md`: add a short "Renombrar un snippet" bullet/section — click sobre el nombre, Enter guarda, Escape cancela; el guardado rápido desde el marcador sigue poniendo las primeras palabras como nombre y ahora lo cambiás con un click. Bump the index date. Commit:

```bash
git add -A
git commit -m "feat(sidebar): rename snippets inline with a click on the name (spec 022 slice A)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure organize plans (Slice B)

**Files:**
- Create: `src/lib/organize/plans.ts`, `src/lib/organize/index.ts`
- Test: `src/lib/organize/plans.test.ts`

**Interfaces:**
- Produces (all pure; rows are plain objects with at least `{id, sortOrder}`; updates are `[{id, ...changes}]` and only include rows whose fields actually change):
  - `sortBySidebarOrder(rows)` → new array, `sortOrder` asc, rows missing a numeric `sortOrder` sink to the end keeping their relative order.
  - `assignInitialOrder(rows)` → updates giving `sortOrder = index` over the given order.
  - `planReorder(container, movedId, targetIndex)` → `{updates}`; `targetIndex` is the index the moved row should occupy after removal-then-insertion; returns `{updates: []}` when nothing changes or `movedId` is absent.
  - `planInsertAtTop(container)` → updates shifting every row's `sortOrder` +1 (caller creates the new row with `sortOrder: 0`).
  - `planMoveToContainer(source, target, movedId, targetIndex, folderId)` → `{updates}`; moved row gets `{folderId, sortOrder}`; both containers renumbered gapless. `source` must contain `movedId`; `target` must not.
  - `planFolderDelete(rootContainer, contents, folderId)` → `{updates}`: every row of `contents` gets `folderId: null` and lands at the folder's position in `rootContainer` (folder row excluded), rest of root renumbered gapless.
  - `buildSidebarTree(items, folders)` → root array sorted by `sortBySidebarOrder` mixing `{kind: 'folder', folder, children}` (children = the folder's items, sorted) and `{kind: 'item', item}` (items with `folderId` pointing at no live folder count as root).

- [ ] **Step 1: Write the failing tests**

`src/lib/organize/plans.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	assignInitialOrder,
	buildSidebarTree,
	planFolderDelete,
	planInsertAtTop,
	planMoveToContainer,
	planReorder,
	sortBySidebarOrder
} from './plans';

const row = (id, sortOrder, extra = {}) => ({ id, sortOrder, ...extra });

describe('sortBySidebarOrder', () => {
	it('sorts by sortOrder and sinks rows without one to the end, stable', () => {
		const rows = [row('c', undefined), row('b', 1), row('d', undefined), row('a', 0)];
		expect(sortBySidebarOrder(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('assignInitialOrder', () => {
	it('numbers rows by their given order, only where changed', () => {
		const updates = assignInitialOrder([row('a', 0), row('b', undefined), row('c', 5)]);
		expect(updates).toEqual([
			{ id: 'b', sortOrder: 1 },
			{ id: 'c', sortOrder: 2 }
		]);
	});
});

describe('planReorder', () => {
	it('moves a row up and renumbers gapless', () => {
		const container = [row('a', 0), row('b', 1), row('c', 2)];
		expect(planReorder(container, 'c', 0).updates).toEqual([
			{ id: 'c', sortOrder: 0 },
			{ id: 'a', sortOrder: 1 },
			{ id: 'b', sortOrder: 2 }
		]);
	});
	it('is a no-op when the position does not change', () => {
		const container = [row('a', 0), row('b', 1)];
		expect(planReorder(container, 'b', 1).updates).toEqual([]);
	});
	it('returns no updates for an unknown id', () => {
		expect(planReorder([row('a', 0)], 'ghost', 0).updates).toEqual([]);
	});
});

describe('planInsertAtTop', () => {
	it('shifts every row down one', () => {
		expect(planInsertAtTop([row('a', 0), row('b', 1)])).toEqual([
			{ id: 'a', sortOrder: 1 },
			{ id: 'b', sortOrder: 2 }
		]);
	});
});

describe('planMoveToContainer', () => {
	it('moves a row into a folder at the top and renumbers both sides', () => {
		const root = [row('f1', 0), row('a', 1), row('b', 2)];
		const inside = [row('x', 0)];
		const { updates } = planMoveToContainer(root, inside, 'b', 0, 'f1');
		expect(updates).toContainEqual({ id: 'b', folderId: 'f1', sortOrder: 0 });
		expect(updates).toContainEqual({ id: 'x', sortOrder: 1 });
		// root closes the gap: f1 keeps 0, a keeps 1 → no update for them
		expect(updates.filter((u) => u.id === 'a' || u.id === 'f1')).toEqual([]);
	});
	it('moves a row out of a folder to a root position', () => {
		const inside = [row('x', 0), row('y', 1)];
		const root = [row('f1', 0), row('a', 1)];
		const { updates } = planMoveToContainer(inside, root, 'y', 1, null);
		expect(updates).toContainEqual({ id: 'y', folderId: null, sortOrder: 1 });
		expect(updates).toContainEqual({ id: 'a', sortOrder: 2 });
	});
});

describe('planFolderDelete', () => {
	it('drops folder contents into the root at the folder position', () => {
		const root = [row('a', 0), row('f1', 1), row('b', 2)];
		const contents = [row('x', 0), row('y', 1)];
		const { updates } = planFolderDelete(root, contents, 'f1');
		expect(updates).toContainEqual({ id: 'x', folderId: null, sortOrder: 1 });
		expect(updates).toContainEqual({ id: 'y', folderId: null, sortOrder: 2 });
		expect(updates).toContainEqual({ id: 'b', sortOrder: 3 });
		expect(updates.filter((u) => u.id === 'a')).toEqual([]);
	});
});

describe('buildSidebarTree', () => {
	it('mixes folders and loose items by sortOrder, children sorted inside', () => {
		const folders = [row('f1', 1, { name: 'Carpeta' })];
		const items = [
			row('a', 0),
			row('x', 1, { folderId: 'f1' }),
			row('w', 0, { folderId: 'f1' }),
			row('b', 2)
		];
		const tree = buildSidebarTree(items, folders);
		expect(tree.map((n) => (n.kind === 'folder' ? n.folder.id : n.item.id))).toEqual([
			'a',
			'f1',
			'b'
		]);
		expect(tree[1].children.map((c) => c.id)).toEqual(['w', 'x']);
	});
	it('treats items pointing at a missing folder as root items', () => {
		const tree = buildSidebarTree([row('a', 0, { folderId: 'ghost' })], []);
		expect(tree).toEqual([{ kind: 'item', item: row('a', 0, { folderId: 'ghost' }) }]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/organize/plans.test.ts` → FAIL ("Cannot find module './plans'").

- [ ] **Step 3: Implement**

`src/lib/organize/plans.ts`:

```js
// Pure sidebar organization math (spec 022). Containers are arrays of rows
// ({id, sortOrder, ...}); a container is either a kind's root list (folders
// and loose items share one sequence) or one folder's contents. Plans return
// minimal update lists; the storage layer applies them, this module never
// touches storage or the DOM.

function hasOrder(row) {
	return typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder);
}

export function sortBySidebarOrder(rows) {
	const ordered = rows.filter(hasOrder).sort((a, b) => a.sortOrder - b.sortOrder);
	return [...ordered, ...rows.filter((row) => !hasOrder(row))];
}

// Renumbers a container to match the given visual order, emitting only changes.
function renumber(rows, extra = undefined) {
	const updates = [];
	rows.forEach((row, index) => {
		const changed = row.sortOrder !== index;
		const needsExtra = extra && Object.keys(extra).some((key) => row[key] !== extra[key]);
		if (changed || needsExtra) updates.push({ id: row.id, ...(needsExtra ? extra : {}), sortOrder: index });
	});
	return updates;
}

export function assignInitialOrder(rows) {
	return renumber(rows);
}

export function planReorder(container, movedId, targetIndex) {
	const sorted = sortBySidebarOrder(container);
	const from = sorted.findIndex((row) => row.id === movedId);
	if (from === -1) return { updates: [] };
	const rest = sorted.filter((row) => row.id !== movedId);
	const clamped = Math.max(0, Math.min(targetIndex, rest.length));
	rest.splice(clamped, 0, sorted[from]);
	return { updates: renumber(rest) };
}

export function planInsertAtTop(container) {
	return sortBySidebarOrder(container).map((row, index) => ({ id: row.id, sortOrder: index + 1 }));
}

export function planMoveToContainer(source, target, movedId, targetIndex, folderId) {
	const sortedSource = sortBySidebarOrder(source);
	const moved = sortedSource.find((row) => row.id === movedId);
	if (!moved) return { updates: [] };
	const remaining = sortedSource.filter((row) => row.id !== movedId);
	const sortedTarget = sortBySidebarOrder(target);
	const clamped = Math.max(0, Math.min(targetIndex, sortedTarget.length));
	const landed = [...sortedTarget];
	landed.splice(clamped, 0, moved);
	const updates = renumber(remaining);
	landed.forEach((row, index) => {
		if (row.id === movedId) updates.push({ id: movedId, folderId, sortOrder: index });
		else if (row.sortOrder !== index) updates.push({ id: row.id, sortOrder: index });
	});
	return { updates };
}

export function planFolderDelete(rootContainer, contents, folderId) {
	const root = sortBySidebarOrder(rootContainer);
	const position = root.findIndex((row) => row.id === folderId);
	const rest = root.filter((row) => row.id !== folderId);
	const insertAt = position === -1 ? rest.length : position;
	const relocated = sortBySidebarOrder(contents).map((row) => ({ row, moved: true }));
	const merged = rest.map((row) => ({ row, moved: false }));
	merged.splice(insertAt, 0, ...relocated);
	const updates = [];
	merged.forEach(({ row, moved }, index) => {
		if (moved) updates.push({ id: row.id, folderId: null, sortOrder: index });
		else if (row.sortOrder !== index) updates.push({ id: row.id, sortOrder: index });
	});
	return { updates };
}

export function buildSidebarTree(items, folders) {
	const folderIds = new Set(folders.map((folder) => folder.id));
	const rootItems = items.filter((item) => !item.folderId || !folderIds.has(item.folderId));
	const root = sortBySidebarOrder([
		...folders.map((folder) => ({ kind: 'folder', folder, sortOrder: folder.sortOrder, id: folder.id })),
		...rootItems.map((item) => ({ kind: 'item', item, sortOrder: item.sortOrder, id: item.id }))
	]);
	return root.map((node) =>
		node.kind === 'folder'
			? {
					kind: 'folder',
					folder: node.folder,
					children: sortBySidebarOrder(items.filter((item) => item.folderId === node.folder.id))
				}
			: { kind: 'item', item: node.item }
	);
}
```

`src/lib/organize/index.ts`:

```js
export {
	sortBySidebarOrder,
	assignInitialOrder,
	planReorder,
	planInsertAtTop,
	planMoveToContainer,
	planFolderDelete,
	buildSidebarTree
} from './plans';
```

Note for the implementer: `buildSidebarTree` items in the test compare with `toEqual` against the raw row — return the raw `item` object untouched (the wrapper `{kind, item}` only at root level). If the `renumber` helper's `extra` mechanism fights the tests, inline the logic per plan function — the tests are the contract, not this sketch.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/organize/plans.test.ts` → PASS (all). Run `pnpm test` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/organize
git commit -m "feat(organize): pure sidebar order and folder plans (spec 022)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Dexie v5 + storage repos (Slice B)

**Files:**
- Modify: `src/lib/storage/db.ts`, `notes.ts`, `snippets.ts`, `tags.ts`, `index.ts`
- Create: `src/lib/storage/organize.ts`, `src/lib/storage/folders.ts`
- Test: `src/lib/storage/organize.test.ts`; modify `notes.test.ts` expectations if any break

**Interfaces:**
- Consumes: `sortBySidebarOrder`, `assignInitialOrder` from `$lib/organize` (Task 3).
- Produces:
  - `db.version(5)`: `folders: 'id, kind'` store; upgrade assigns `sortOrder` (notes/snippets by `updatedAt` desc, tags by name) and `folderId: null` to notes/snippets.
  - `createNote`/`createSnippet`/`createTag` insert at root top (`sortOrder: 0`, others shifted +1; notes/snippets also shift folders of their kind). New rows carry `folderId: null` (notes/snippets).
  - `listNotes`/`listSnippets`/`listTags` sorted with `sortBySidebarOrder` (favorites no longer float in `listSnippets`; `listFavoriteSnippets` unchanged).
  - `src/lib/storage/folders.ts`: `createFolder(kind, name)` (at root top, `collapsed: false`), `listFolders(kind)` (live, sorted), `updateFolder(id, changes)`, `deleteFolderKeepContents(id, updates)` — soft-deletes the folder and applies the relocation updates in ONE transaction.
  - `src/lib/storage/organize.ts`: `applySidebarUpdates(tableName, updates)` (one rw transaction, bumps `updatedAt`), `ensureSidebarOrder()` (renumbers every container gapless, preserving current visual order; assigns missing sortOrders — used after backup import).
  - All exported from `$lib/storage`.

- [ ] **Step 1: Write the failing tests**

`src/lib/storage/organize.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, listNotes } from './notes';
import { createSnippet, listSnippets } from './snippets';
import { createTag, listTags } from './tags';
import { createFolder, deleteFolderKeepContents, listFolders, updateFolder } from './folders';
import { applySidebarUpdates, ensureSidebarOrder } from './organize';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('create at top', () => {
	it('new notes land at sortOrder 0 and shift the rest', async () => {
		const first = await createNote({ title: 'primera' });
		const second = await createNote({ title: 'segunda' });
		const rows = await listNotes();
		expect(rows.map((row) => row.title)).toEqual(['segunda', 'primera']);
		expect(rows.map((row) => row.sortOrder)).toEqual([0, 1]);
		expect(second.folderId).toBeNull();
		expect(first.id).not.toBe(second.id);
	});

	it('a new note also shifts note folders sharing the root', async () => {
		const folder = await createFolder('note', 'Trabajo');
		await createNote({ title: 'nueva' });
		const folders = await listFolders('note');
		expect(folders[0].id).toBe(folder.id);
		expect(folders[0].sortOrder).toBe(1);
	});

	it('snippets and tags do the same among themselves', async () => {
		await createSnippet({ name: 'uno', content: 'a' });
		await createSnippet({ name: 'dos', content: 'b' });
		await createTag({ name: 'zeta' });
		await createTag({ name: 'alfa' });
		expect((await listSnippets()).map((row) => row.name)).toEqual(['dos', 'uno']);
		// Manual order now beats the old alphabetical order.
		expect((await listTags()).map((row) => row.name)).toEqual(['alfa', 'zeta']);
	});
});

describe('applySidebarUpdates', () => {
	it('applies order changes in one shot', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		await applySidebarUpdates('notes', [
			{ id: a.id, sortOrder: 0 },
			{ id: b.id, sortOrder: 1 }
		]);
		expect((await listNotes()).map((row) => row.title)).toEqual(['a', 'b']);
	});
});

describe('folders', () => {
	it('deleteFolderKeepContents soft-deletes the folder and applies relocations', async () => {
		const folder = await createFolder('snippet', 'Clientes');
		const snippet = await createSnippet({ name: 's', content: 'x' });
		await applySidebarUpdates('snippets', [{ id: snippet.id, folderId: folder.id, sortOrder: 0 }]);
		await deleteFolderKeepContents(folder.id, {
			snippets: [{ id: snippet.id, folderId: null, sortOrder: 0 }]
		});
		expect(await listFolders('snippet')).toEqual([]);
		const rows = await listSnippets();
		expect(rows[0].folderId).toBeNull();
	});

	it('updateFolder persists collapse and name', async () => {
		const folder = await createFolder('note', 'Ideas');
		await updateFolder(folder.id, { collapsed: true, name: 'Ideas 2026' });
		const rows = await listFolders('note');
		expect(rows[0].collapsed).toBe(true);
		expect(rows[0].name).toBe('Ideas 2026');
	});
});

describe('ensureSidebarOrder', () => {
	it('assigns missing sortOrders after the existing ones and closes gaps', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		// Simulate imported rows: one with a gapped order, one with none.
		await db.table('notes').update(a.id, { sortOrder: 7 });
		await db.table('notes').update(b.id, { sortOrder: undefined });
		await ensureSidebarOrder();
		const rows = await listNotes();
		expect(rows.map((row) => row.sortOrder)).toEqual([0, 1]);
		expect(rows[0].title).toBe('a');
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/storage/organize.test.ts` → FAIL ("Cannot find module './folders'").

- [ ] **Step 3: Implement**

`src/lib/storage/db.ts` — append after the v4 block:

```js
// v5 (spec 022): manual sidebar order + folders. Every live note/snippet/tag
// gets an initial sortOrder matching the order the sidebar showed before
// (notes/snippets: updatedAt desc; tags: alphabetical); notes/snippets start
// at the root (folderId null). Deleted rows get ordered after the live ones
// so a future restore cannot collide with the live sequence.
db.version(5)
	.stores({
		folders: 'id, kind'
	})
	.upgrade(async (tx) => {
		const byRecency = (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
		const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '');
		const migrate = async (name, compare, withFolder) => {
			const rows = await tx.table(name).toArray();
			const live = rows.filter((row) => !row.deletedAt).sort(compare);
			const dead = rows.filter((row) => row.deletedAt).sort(compare);
			await Promise.all(
				[...live, ...dead].map((row, index) =>
					tx.table(name).update(row.id, {
						sortOrder: index,
						...(withFolder && row.folderId === undefined ? { folderId: null } : {})
					})
				)
			);
		};
		await migrate('notes', byRecency, true);
		await migrate('snippets', byRecency, true);
		await migrate('tags', byName, false);
	});
```

`src/lib/storage/organize.ts` (new):

```js
// Storage side of sidebar organization (spec 022). The pure plans live in
// $lib/organize; this file applies their updates and keeps the shared root
// sequence (items + folders of one kind) consistent.

import { db } from './db';
import { now } from './ids';
import { sortBySidebarOrder } from '../organize';

const KIND_ITEM_TABLE = { note: 'notes', snippet: 'snippets' };

export async function applySidebarUpdates(tableName, updates) {
	if (!updates?.length) return;
	const timestamp = now();
	await db.transaction('rw', db.table(tableName), async () => {
		for (const { id, ...changes } of updates) {
			await db.table(tableName).update(id, { ...changes, updatedAt: timestamp });
		}
	});
}

// +1 on every live root row that shares the kind's root sequence. For notes
// and snippets that is the item table AND the folders of that kind; tags have
// no folders. Runs inside its own transaction; callers add the new row after.
export async function shiftRootDown(kind) {
	const itemTable = kind === 'tag' ? 'tags' : KIND_ITEM_TABLE[kind];
	const tables = kind === 'tag' ? [db.table('tags')] : [db.table(itemTable), db.table('folders')];
	await db.transaction('rw', tables, async () => {
		await db
			.table(itemTable)
			.filter((row) => !row.deletedAt && (kind === 'tag' || (row.folderId ?? null) === null))
			.modify((row) => {
				if (typeof row.sortOrder === 'number') row.sortOrder += 1;
			});
		if (kind !== 'tag') {
			await db
				.table('folders')
				.filter((row) => !row.deletedAt && row.kind === kind)
				.modify((row) => {
					if (typeof row.sortOrder === 'number') row.sortOrder += 1;
				});
		}
	});
}

// Renumber every container gapless, preserving the current visual order.
// Safety net after backup imports (which may bring gaps, duplicates or rows
// without sortOrder from old backups).
export async function ensureSidebarOrder() {
	const renumber = (rows) =>
		sortBySidebarOrder(rows)
			.map((row, index) => ({ row, index }))
			.filter(({ row, index }) => row.sortOrder !== index);

	for (const kind of ['note', 'snippet']) {
		const itemTable = KIND_ITEM_TABLE[kind];
		const [items, folders] = await Promise.all([
			db.table(itemTable).filter((row) => !row.deletedAt).toArray(),
			db.table('folders').filter((row) => !row.deletedAt && row.kind === kind).toArray()
		]);
		const folderIds = new Set(folders.map((folder) => folder.id));
		const rootItems = items.filter((item) => !item.folderId || !folderIds.has(item.folderId));
		const rootFolders = folders.map((folder) => ({ ...folder, __table: 'folders' }));
		const root = [...rootFolders, ...rootItems.map((item) => ({ ...item, __table: itemTable }))];
		for (const { row, index } of renumber(root)) {
			await db.table(row.__table).update(row.id, { sortOrder: index });
		}
		for (const folder of folders) {
			const contents = items.filter((item) => item.folderId === folder.id);
			for (const { row, index } of renumber(contents)) {
				await db.table(itemTable).update(row.id, { sortOrder: index });
			}
		}
	}
	const tags = await db.table('tags').filter((row) => !row.deletedAt).toArray();
	for (const { row, index } of renumber(tags)) {
		await db.table('tags').update(row.id, { sortOrder: index });
	}
}
```

`src/lib/storage/folders.ts` (new):

```js
import { db } from './db';
import { createId, now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { shiftRootDown } from './organize';

const folders = db.table('folders');

export async function createFolder(kind, name) {
	await shiftRootDown(kind);
	const timestamp = now();
	const folder = {
		id: createId(),
		kind,
		name,
		sortOrder: 0,
		collapsed: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await folders.add(folder);
	return folder;
}

export async function listFolders(kind) {
	const rows = await folders.filter((folder) => !folder.deletedAt && folder.kind === kind).toArray();
	return sortBySidebarOrder(rows);
}

export async function updateFolder(id, changes) {
	await folders.update(id, { ...changes, updatedAt: now() });
	return folders.get(id);
}

// Soft-delete + relocation of the contents in one transaction so a crash
// can never leave items pointing at a dead folder without their new order.
// `updates` is { notes?: [...], snippets?: [...] } from planFolderDelete.
export async function deleteFolderKeepContents(id, updates) {
	const timestamp = now();
	const tableNames = ['folders', ...Object.keys(updates)];
	await db.transaction('rw', tableNames.map((name) => db.table(name)), async () => {
		await folders.update(id, { deletedAt: timestamp, updatedAt: timestamp });
		for (const [tableName, rows] of Object.entries(updates)) {
			for (const { id: rowId, ...changes } of rows) {
				await db.table(tableName).update(rowId, { ...changes, updatedAt: timestamp });
			}
		}
	});
}
```

`src/lib/storage/notes.ts` — `createNote` becomes:

```js
export async function createNote({ title = '' } = {}) {
	await shiftRootDown('note');
	const timestamp = now();
	const note = {
		id: createId(),
		title,
		sortOrder: 0,
		folderId: null,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await notes.add(note);
	return note;
}
```

with `import { shiftRootDown } from './organize';` and `import { sortBySidebarOrder } from '../organize';`, and `listNotes` becomes:

```js
export async function listNotes() {
	const rows = await notes.filter((note) => !note.deletedAt).toArray();
	return sortBySidebarOrder(rows);
}
```

`src/lib/storage/snippets.ts` — same treatment: `createSnippet` calls `await shiftRootDown('snippet');` first and adds `sortOrder: 0, folderId: null` to the record; `listSnippets` returns `sortBySidebarOrder(rows)` (drop the `updatedAt` sort). `listFavoriteSnippets` stays as-is (filters the sorted list). `src/lib/storage/tags.ts` — `createTag` calls `await shiftRootDown('tag');` first and adds `sortOrder: 0`; `listTags` returns `sortBySidebarOrder(rows)` (drop the alphabetical sort). **Check `findOrCreateTag`/`renameTag`** — they call `listTags()` only to scan for matches; order change is harmless.

`src/lib/storage/index.ts` — add:

```js
export { createFolder, listFolders, updateFolder, deleteFolderKeepContents } from './folders';
export { applySidebarUpdates, shiftRootDown, ensureSidebarOrder } from './organize';
```

- [ ] **Step 4: Run to verify pass + fix fallout**

Run: `pnpm vitest run src/lib/storage/organize.test.ts` → PASS. Run: `pnpm test` → existing storage tests may assert old orderings. Expected safe fallout: `tags.test.ts` if it asserts alphabetical `listTags` (update the expectation to creation-order-newest-first and note why), similar for `snippets.test.ts`/`notes.test.ts` ordering asserts. Do NOT change production code to keep old expectations — the new ordering is the feature. Everything else must stay green.

- [ ] **Step 5: Migration sanity script**

Write `/private/tmp/claude-501/-Users-hernanoliva-Projects-CopyNotes/*/scratchpad/verify-migration-v5.mjs` (follow the pattern of the earlier `verify-migration-v3.mjs`: create a Dexie db with the v4 schema + seed rows in fake-indexeddb, close, reopen with the app's v5 definition, assert sortOrder matches updatedAt-desc order and folders table exists). Run with `node --experimental-vm-modules` or plain `node` after `npm i` is NOT needed — import `dexie` and `fake-indexeddb` from the project's `node_modules`. Expected output: `v5 migration OK`. This script is scratch verification, not committed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage src/lib/organize
git commit -m "feat(storage): Dexie v5 — folders table, sortOrder migration, create-at-top (spec 022)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Backup format v4 (Slice B)

**Files:**
- Modify: `src/lib/export-import/schema.ts`, `merge.ts`, `backup.ts`
- Modify: `src/lib/storage/backup.ts`
- Modify: `src/lib/components/BackupDialog.svelte`
- Modify: `specs/018-backup-json-format.md`
- Test: `src/lib/export-import/schema.test.ts`, `merge.test.ts`, `backup.test.ts` (extend)

**Interfaces:**
- Consumes: `ensureSidebarOrder` from `$lib/storage` (Task 4).
- Produces: `CURRENT_VERSION = 4`, `SUPPORTED_VERSIONS = [1, 2, 3, 4]`; `backup.data.folders` always an array after validation; malformed `sortOrder`/`folderId` silently normalized (dropped / nulled) with one warning; `planMerge` handles folders + remaps `folderId`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/export-import/schema.test.ts` (reuse the file's existing `makeBackup`-style helpers — read the file first and copy its fixture builder; the snippets below assume a helper `validBackup()` returning a minimal passing v4 object; adapt names to what exists):

```ts
describe('backup v4 organization fields (spec 022)', () => {
	it('accepts v4 with folders and organization fields', () => {
		const raw = validBackup();
		raw.formatVersion = 4;
		raw.data.folders = [
			{
				id: 'f1', kind: 'note', name: 'Trabajo', sortOrder: 0, collapsed: false,
				createdAt: NOW, updatedAt: NOW, deletedAt: null
			}
		];
		raw.data.notes[0].sortOrder = 0;
		raw.data.notes[0].folderId = 'f1';
		const result = validateBackup(raw);
		expect(result.ok).toBe(true);
		expect(result.backup.data.folders).toHaveLength(1);
		expect(result.backup.data.notes[0].folderId).toBe('f1');
	});

	it('older backups without folders still validate and get an empty folders array', () => {
		const raw = validBackup(); // formatVersion 3, no data.folders key
		const result = validateBackup(raw);
		expect(result.ok).toBe(true);
		expect(result.backup.data.folders).toEqual([]);
	});

	it('drops malformed sortOrder and orphan folderId instead of rejecting', () => {
		const raw = validBackup();
		raw.formatVersion = 4;
		raw.data.folders = [];
		raw.data.notes[0].sortOrder = -3;
		raw.data.notes[0].folderId = 'ghost';
		const result = validateBackup(raw);
		expect(result.ok).toBe(true);
		expect(result.backup.data.notes[0].sortOrder).toBeUndefined();
		expect(result.backup.data.notes[0].folderId).toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it('folderId pointing at a folder of the other kind is nulled', () => {
		const raw = validBackup();
		raw.formatVersion = 4;
		raw.data.folders = [
			{
				id: 'f1', kind: 'snippet', name: 'X', sortOrder: 0, collapsed: false,
				createdAt: NOW, updatedAt: NOW, deletedAt: null
			}
		];
		raw.data.notes[0].folderId = 'f1';
		const result = validateBackup(raw);
		expect(result.ok).toBe(true);
		expect(result.backup.data.notes[0].folderId).toBeNull();
	});
});
```

Append to `src/lib/export-import/merge.test.ts` (again matching its local fixture style):

```ts
describe('merge with folders (spec 022)', () => {
	it('inserts new folders and remaps folderId on conflicted folder ids', () => {
		const folder = {
			id: 'f1', kind: 'note', name: 'Trabajo', sortOrder: 0, collapsed: false,
			createdAt: NOW, updatedAt: NOW, deletedAt: null
		};
		const localFolder = { ...folder, name: 'Distinto' };
		const local = { ...emptyTables(), folders: [localFolder] };
		const incoming = {
			...emptyTables(),
			folders: [folder],
			notes: [{ ...baseNote('n1'), folderId: 'f1', sortOrder: 0 }]
		};
		const plan = planMerge(local, incoming, { createId: () => 'fresh' });
		expect(plan.inserts.folders).toEqual([{ ...folder, id: 'fresh' }]);
		expect(plan.inserts.notes[0].folderId).toBe('fresh');
	});

	it('merging a v3 backup (no folders key) plans no folder inserts', () => {
		const plan = planMerge(emptyTables(), { ...emptyTables(), folders: undefined });
		expect(plan.inserts.folders).toEqual([]);
	});
});
```

And to `src/lib/export-import/backup.test.ts`: assert `buildBackup` output has `formatVersion` 4, a `data.folders` array and `counts.folders`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/export-import` → new tests FAIL (folders stripped/undefined, version 3).

- [ ] **Step 3: Implement**

`schema.ts`:

```js
export const SUPPORTED_VERSIONS = [1, 2, 3, 4];
export const CURRENT_VERSION = 4;
```

(update the version comment: v4 = sidebar organization — folders + sortOrder/folderId). Add after `tagSchema`:

```js
const folderSchema = v.looseObject({
	id: v.string(),
	kind: v.picklist(['note', 'snippet']),
	name: v.string(),
	sortOrder: v.number(),
	collapsed: v.boolean(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});
```

In `backupSchema`'s `data` object add `folders: v.optional(v.array(folderSchema), [])`. Add the normalization pass (spec: malformed organization fields are dropped, never fatal — `looseObject` passes them through unchecked, so this pass is the actual gate):

```js
// Organization fields (spec 022) are best-effort: a bad sortOrder or a
// folderId pointing nowhere must not sink a whole backup. Normalize in
// place after shape validation; returns true when something was dropped.
function normalizeOrganization(data) {
	let touched = false;
	const dropOrder = (row) => {
		if (row.sortOrder !== undefined && (!Number.isInteger(row.sortOrder) || row.sortOrder < 0)) {
			delete row.sortOrder;
			touched = true;
		}
	};
	const folderIdsByKind = { note: new Set(), snippet: new Set() };
	for (const folder of data.folders) {
		dropOrder(folder);
		folderIdsByKind[folder.kind].add(folder.id);
	}
	const fixItems = (rows, kind) => {
		for (const row of rows) {
			dropOrder(row);
			if (row.folderId !== undefined && row.folderId !== null) {
				if (typeof row.folderId !== 'string' || !folderIdsByKind[kind].has(row.folderId)) {
					row.folderId = null;
					touched = true;
				}
			}
		}
	};
	fixItems(data.notes, 'note');
	fixItems(data.snippets, 'snippet');
	for (const tag of data.tags) dropOrder(tag);
	return touched;
}
```

In `validateBackup`, after `referenceErrors` passes and before building `counts`:

```js
	const warnings = [];
	if (normalizeOrganization(backup.data)) {
		warnings.push('Se descartaron datos de orden o carpeta inválidos; esos elementos quedan en la lista general.');
	}
```

(then keep the existing counts-warning loop pushing into the same `warnings` array). Extend the `TABLES` const in `schema.ts` and the `counts` object with `folders`, so declared-count warnings cover it.

`merge.ts` — in `planMerge`:

```js
	const folderRemap = new Map();
	const folders = planTable(local.folders ?? [], incoming.folders ?? [], folderRemap, createId);
	const toFolder = mapped(folderRemap);
	for (const row of notes.inserts) {
		if (row.folderId) row.folderId = toFolder(row.folderId);
	}
	for (const row of snippets.inserts) {
		if (row.sourceNoteId) row.sourceNoteId = toNote(row.sourceNoteId);
		if (row.sourceBlockId) row.sourceBlockId = toBlock(row.sourceBlockId);
		if (row.folderId) row.folderId = toFolder(row.folderId);
	}
```

(the snippet loop replaces the existing one; the notes loop is new — place both after the existing block remap loop) and add `folders` to the `tables` object so it flows into `inserts`/`summary`.

`export-import/backup.ts` and `storage/backup.ts`: add `'folders'` to each `TABLES` list (in `storage/backup.ts` put it before `'settings'` so `applyMergePlan`'s settings skip keeps working — order in that array otherwise doesn't matter).

`BackupDialog.svelte`: after `await applyMergePlan($state.snapshot(review.plan));` (line ~99) and after `await replaceAllTables({ ...data, settings: filterSafeSettings(data.settings) });` (line ~113) add `await ensureSidebarOrder();` (import it from `$lib/storage`) — imported old backups get gapless manual orders assigned from their previous visible order.

`specs/018-backup-json-format.md`: document v4 — new `folders` table (fields as in `folderSchema`), optional `sortOrder` on notes/snippets/tags, optional nullable `folderId` on notes/snippets, normalization rule (malformed dropped with warning, never fatal), `SUPPORTED_VERSIONS = [1,2,3,4]`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/export-import` → PASS. Run `pnpm test` → green. Run `pnpm check` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(backup): format v4 — folders and sidebar order travel in backups (spec 022)

Malformed organization fields are dropped with a warning, never fatal;
imports finish with ensureSidebarOrder so old backups get gapless orders.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Drag & drop module (Slice B)

**Files:**
- Create: `src/lib/components/dnd.ts`
- Test: `src/lib/components/dnd.test.ts` (pure part only; the attachment is covered by e2e in Task 7)

**Interfaces:**
- Produces:
  - `dropTarget(rows, pointerY)` (pure) — `rows`: `[{id, top, height, folderId: string|null, isFolder: boolean, isOpenFolder: boolean}]` in visual order (folder children included, root-level rows have `folderId: null`). Returns `{ type: 'into-folder', folderId }` when the pointer sits in the middle band (30%–70% height) of a folder row, else `{ type: 'insert', container: string|null, index }` where `container` is the folderId of the container the gap belongs to and `index` the insertion index INSIDE that container.
  - `sidebarDragList(getOptions)` — Svelte attachment factory for a list element. `getOptions()` returns `{ rows: () => [...], onDrop: (dragged, target) => {}, canDropInto: (draggedId, folderId) => boolean }`. Attachment wires pointer events on `[data-drag-id]` children: 5px threshold (mouse/pen), 500ms long-press (touch), Escape cancels, visual feedback via `data-drag-*` attributes and one indicator element. Calls `onDrop(draggedId, target)` with `target` from `dropTarget`.

- [ ] **Step 1: Write the failing tests for the pure part**

`src/lib/components/dnd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dropTarget } from './dnd';

const mk = (id, top, height, extra = {}) => ({
	id, top, height, folderId: null, isFolder: false, isOpenFolder: false, ...extra
});

describe('dropTarget', () => {
	const rows = [mk('a', 0, 30), mk('b', 30, 30), mk('c', 60, 30)];

	it('maps the pointer to the insertion gap by row midlines', () => {
		expect(dropTarget(rows, 10)).toEqual({ type: 'insert', container: null, index: 0 });
		expect(dropTarget(rows, 40)).toEqual({ type: 'insert', container: null, index: 1 });
		expect(dropTarget(rows, 100)).toEqual({ type: 'insert', container: null, index: 3 });
	});

	it('targets a folder in its middle band', () => {
		const withFolder = [mk('a', 0, 30), mk('f1', 30, 30, { isFolder: true })];
		expect(dropTarget(withFolder, 45)).toEqual({ type: 'into-folder', folderId: 'f1' });
		// Top edge of the folder row is still an insertion gap.
		expect(dropTarget(withFolder, 32)).toEqual({ type: 'insert', container: null, index: 1 });
	});

	it('gaps between an open folder child rows belong to that folder container', () => {
		const rows = [
			mk('f1', 0, 30, { isFolder: true, isOpenFolder: true }),
			mk('x', 30, 30, { folderId: 'f1' }),
			mk('y', 60, 30, { folderId: 'f1' }),
			mk('b', 90, 30)
		];
		expect(dropTarget(rows, 58)).toEqual({ type: 'insert', container: 'f1', index: 1 });
		// Below the last child but above b's midline: end of the folder.
		expect(dropTarget(rows, 80)).toEqual({ type: 'insert', container: 'f1', index: 2 });
	});

	it('empty list drops at index 0 of the root', () => {
		expect(dropTarget([], 10)).toEqual({ type: 'insert', container: null, index: 0 });
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/components/dnd.test.ts` → FAIL ("Cannot find module './dnd'").

- [ ] **Step 3: Implement**

`src/lib/components/dnd.ts`:

```js
// Sidebar drag & drop (spec 022). dropTarget is pure geometry so it can be
// node-tested; sidebarDragList is a Svelte attachment that owns the pointer
// lifecycle. Mouse/pen lift after a 5px move; touch lifts after a 500ms
// long-press so plain swipes keep scrolling the list.

const MOUSE_THRESHOLD_PX = 5;
const TOUCH_CANCEL_PX = 10;
const LONG_PRESS_MS = 500;
const FOLDER_BAND = [0.3, 0.7];

export function dropTarget(rows, pointerY) {
	// Folder middle band wins over gap math.
	for (const row of rows) {
		if (!row.isFolder) continue;
		const y = (pointerY - row.top) / row.height;
		if (y >= FOLDER_BAND[0] && y <= FOLDER_BAND[1]) {
			return { type: 'into-folder', folderId: row.id };
		}
	}
	for (let i = 0; i < rows.length; i++) {
		if (pointerY < rows[i].top + rows[i].height / 2) {
			// The gap above row i belongs to row i's container — except right
			// above an open folder's first child, where the previous row is the
			// folder itself and index 0 inside it is the same visual gap.
			const container = rows[i].isFolder ? null : (rows[i].folderId ?? null);
			const index = indexWithinContainer(rows, i, container);
			return { type: 'insert', container, index };
		}
	}
	// Past every midline: append. If the last row is a folder child, the gap
	// still reads as that folder's tail until the next root row's midline.
	const last = rows[rows.length - 1];
	if (last && !last.isFolder && last.folderId) {
		return {
			type: 'insert',
			container: last.folderId,
			index: indexWithinContainer(rows, rows.length, last.folderId)
		};
	}
	return { type: 'insert', container: null, index: rootCount(rows) };
}

function indexWithinContainer(rows, beforeVisualIndex, container) {
	let index = 0;
	for (let i = 0; i < beforeVisualIndex; i++) {
		const row = rows[i];
		if (container === null) {
			if (row.isFolder || (row.folderId ?? null) === null) index += 1;
		} else if (!row.isFolder && row.folderId === container) {
			index += 1;
		}
	}
	return index;
}

function rootCount(rows) {
	return rows.filter((row) => row.isFolder || (row.folderId ?? null) === null).length;
}

export function sidebarDragList(getOptions) {
	return (node) => {
		let pressed = null; // { id, x, y, pointerId, pointerType }
		let dragging = null; // { id }
		let longPressTimer = null;
		let indicator = null;

		const rowEls = () => [...node.querySelectorAll('[data-drag-id]')];

		function measuredRows() {
			const listTop = node.getBoundingClientRect().top;
			return rowEls().map((el) => {
				const rect = el.getBoundingClientRect();
				return {
					id: el.dataset.dragId,
					top: rect.top - listTop,
					height: rect.height,
					folderId: el.dataset.dragFolderId || null,
					isFolder: el.dataset.dragIsFolder === 'true',
					isOpenFolder: el.dataset.dragOpenFolder === 'true',
					el
				};
			});
		}

		function ensureIndicator() {
			if (indicator) return indicator;
			indicator = document.createElement('div');
			indicator.style.cssText =
				'position:absolute;left:8px;right:8px;height:2px;border-radius:1px;' +
				'background:var(--ring);pointer-events:none;z-index:10;';
			node.style.position = 'relative';
			node.appendChild(indicator);
			return indicator;
		}

		function clearFeedback() {
			indicator?.remove();
			indicator = null;
			for (const el of rowEls()) {
				el.removeAttribute('data-drag-over-folder');
				el.removeAttribute('data-dragging');
			}
		}

		function startDrag(id) {
			dragging = { id };
			const el = rowEls().find((row) => row.dataset.dragId === id);
			el?.setAttribute('data-dragging', 'true');
		}

		function stopDrag() {
			pressed = null;
			dragging = null;
			clearTimeout(longPressTimer);
			longPressTimer = null;
			clearFeedback();
		}

		function currentTarget(clientY) {
			const listTop = node.getBoundingClientRect().top;
			const rows = measuredRows();
			// The dragged row keeps its space; exclude it from geometry so the
			// gap math reflects the list as it will be after the move.
			return { rows, target: dropTarget(rows.filter((r) => r.id !== dragging.id), clientY - listTop) };
		}

		function showFeedback(clientY) {
			const { rows, target } = currentTarget(clientY);
			clearFeedback();
			rows.find((r) => r.id === dragging.id)?.el.setAttribute('data-dragging', 'true');
			if (target.type === 'into-folder') {
				rows.find((r) => r.id === target.folderId)?.el.setAttribute('data-drag-over-folder', 'true');
				return;
			}
			const visible = rows.filter((r) => r.id !== dragging.id);
			let y;
			if (visible.length === 0) y = 0;
			else {
				// Place the line at the top of the row occupying the target gap,
				// or after the last row when appending.
				const gapRow = gapRowFor(visible, target);
				y = gapRow ? gapRow.top : visible[visible.length - 1].top + visible[visible.length - 1].height;
			}
			const line = ensureIndicator();
			line.style.top = `${y - 1}px`;
		}

		function gapRowFor(visible, target) {
			let count = 0;
			for (const row of visible) {
				const inContainer =
					target.container === null
						? row.isFolder || (row.folderId ?? null) === null
						: !row.isFolder && row.folderId === target.container;
				if (inContainer) {
					if (count === target.index) return row;
					count += 1;
				}
			}
			return null;
		}

		function onPointerDown(event) {
			if (event.button !== undefined && event.button !== 0) return;
			const rowEl = event.target.closest('[data-drag-id]');
			if (!rowEl || !node.contains(rowEl)) return;
			// Don't hijack interactive children (rename inputs, buttons still
			// start a press — the threshold keeps plain clicks working).
			if (event.target.closest('input, textarea')) return;
			pressed = {
				id: rowEl.dataset.dragId,
				x: event.clientX,
				y: event.clientY,
				pointerId: event.pointerId,
				pointerType: event.pointerType
			};
			if (event.pointerType === 'touch') {
				longPressTimer = setTimeout(() => {
					if (pressed) startDrag(pressed.id);
				}, LONG_PRESS_MS);
			}
		}

		function onPointerMove(event) {
			if (!pressed || event.pointerId !== pressed.pointerId) return;
			const distance = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
			if (!dragging) {
				if (pressed.pointerType === 'touch') {
					if (distance > TOUCH_CANCEL_PX) stopDrag(); // it's a scroll
					return;
				}
				if (distance < MOUSE_THRESHOLD_PX) return;
				startDrag(pressed.id);
			}
			event.preventDefault();
			showFeedback(event.clientY);
		}

		function onPointerUp(event) {
			if (!pressed || event.pointerId !== pressed.pointerId) return;
			if (!dragging) {
				stopDrag();
				return; // plain click — let it through
			}
			const { target } = currentTarget(event.clientY);
			const options = getOptions();
			const draggedId = dragging.id;
			stopDrag();
			if (target.type === 'into-folder' && options.canDropInto && !options.canDropInto(draggedId, target.folderId)) {
				return;
			}
			options.onDrop(draggedId, target);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape' && dragging) {
				event.stopPropagation();
				stopDrag();
			}
		}

		// Blocks native touch scrolling only while a drag is live.
		function onTouchMove(event) {
			if (dragging) event.preventDefault();
		}

		node.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', stopDrag);
		window.addEventListener('keydown', onKeyDown, true);
		node.addEventListener('touchmove', onTouchMove, { passive: false });

		return () => {
			stopDrag();
			node.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', stopDrag);
			window.removeEventListener('keydown', onKeyDown, true);
			node.removeEventListener('touchmove', onTouchMove);
		};
	};
}
```

Adjust `dropTarget` until the tests pass — the tests are the contract (in particular the open-folder tail case at pointer 80: y is past `y`'s midline (75) and before `b`'s midline (105), and row `b` is a root row, so the naive "container of row b" answer would be root; the expected answer is the folder tail. The trick: when the gap row is a ROOT row and the visually previous row is a child of an open folder, the gap belongs to that folder's tail. Implement exactly that rule.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/components/dnd.test.ts` → PASS. `pnpm check` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/dnd.ts src/lib/components/dnd.test.ts
git commit -m "feat(sidebar): pointer drag-and-drop module with pure drop geometry (spec 022)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire reorder into the sidebar (Slice B)

**Files:**
- Modify: `src/lib/components/NoteSidebar.svelte`, `src/routes/+page.svelte`
- Test: extend `e2e/sidebar-organization.spec.ts`
- Create: `docs/guia/13-ordenar-y-carpetas.md`; modify `docs/guia-de-uso.md`

**Interfaces:**
- Consumes: `sidebarDragList` (Task 6), `planReorder` + `applySidebarUpdates` (Tasks 3–4), `onRenameSnippet` rows (Task 2).
- Produces: `NoteSidebar` props `onReorder(view, draggedId, target)`; each list `<ul>` carries `{@attach sidebarDragList(...)}`; rows carry `data-drag-id`. Task 9 extends the same wiring with folder rows.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/sidebar-organization.spec.ts`:

```ts
async function dragRowTo(page, source, target, offsetY = 0) {
	const src = await source.boundingBox();
	const dst = await target.boundingBox();
	await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
	await page.mouse.down();
	// pass the 5px threshold first, then travel in steps
	await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + 8, { steps: 2 });
	await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2 + offsetY, { steps: 8 });
	await page.mouse.up();
}

test('notes can be dragged into a manual order that survives reload', async ({ page }) => {
	await page.goto('/');
	// Three notes; each new note lands on top → visual order: C, B, A.
	for (const title of ['Nota A', 'Nota B', 'Nota C']) {
		await page.getByRole('button', { name: 'Nueva nota' }).click();
		await page.getByRole('textbox', { name: 'Título de la nota' }).fill(title);
		await page.waitForTimeout(700); // title autosave
	}
	const list = page.getByRole('navigation', { name: 'Lista de notas' });
	await expect(list.getByRole('button', { name: /Nota/ })).toHaveText([
		/Nota C/, /Nota B/, /Nota A/
	]);

	// Drag A above C (to the very top).
	await dragRowTo(
		page,
		list.getByRole('button', { name: 'Nota A' }),
		list.getByRole('button', { name: 'Nota C' }),
		-6
	);
	await expect(list.getByRole('button', { name: /Nota/ })).toHaveText([
		/Nota A/, /Nota C/, /Nota B/
	]);

	await page.reload();
	await expect(
		page.getByRole('navigation', { name: 'Lista de notas' }).getByRole('button', { name: /Nota/ })
	).toHaveText([/Nota A/, /Nota C/, /Nota B/]);
});
```

Check the real accessible name of the note-title input before running (`grep -n "aria-label" src/lib/editor/Editor.svelte | grep -i título`) and adjust the `getByRole('textbox', …)` line to the actual label. If notes are only creatable with a typed title via the editor heading, instead type into the first block: click the editor, type the title, wait 700ms.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:e2e -- sidebar-organization` → the new test FAILS (drag does nothing).

- [ ] **Step 3: Implement the wiring**

`NoteSidebar.svelte`:

```js
import { sidebarDragList } from './dnd';
let { …existing props…, onReorder } = $props();
```

Notes list — on the `<ul>`:

```svelte
<ul
	class="flex flex-col gap-0.5"
	{@attach sidebarDragList(() => ({
		onDrop: (id, target) => onReorder('notes', id, target),
		canDropInto: () => false
	}))}
>
```

and on each note `<li>` add `data-drag-id={note.id}`. Same for the snippets `<ul>`/`<li>` (`onReorder('snippets', id, target)`, `data-drag-id={snippet.id}`) and the tags `<ul>`/`<li>` (`onReorder('tags', id, target)`, `data-drag-id={tag.id}`). Add drag feedback styles in the component's `<style>` block (attribute-driven, set by dnd.ts):

```css
:global([data-dragging='true']) {
	opacity: 0.4;
}
:global([data-drag-over-folder='true']) {
	outline: 2px solid var(--ring);
	outline-offset: -2px;
	border-radius: 6px;
}
```

`+page.svelte`:

```js
import { planReorder } from '$lib/organize';
import { applySidebarUpdates } from '$lib/storage';

async function reorderSidebar(view, draggedId, target) {
	if (target.type !== 'insert' || target.container !== null) return; // folders arrive in slice C
	if (view === 'notes') {
		const container = notes.filter((note) => (note.folderId ?? null) === null);
		await applySidebarUpdates('notes', planReorder($state.snapshot(container), draggedId, target.index).updates);
		notes = await listNotes();
	} else if (view === 'snippets') {
		const container = snippets.filter((snippet) => (snippet.folderId ?? null) === null);
		await applySidebarUpdates('snippets', planReorder($state.snapshot(container), draggedId, target.index).updates);
		snippets = await listSnippets();
	} else if (view === 'tags') {
		await applySidebarUpdates('tags', planReorder($state.snapshot(tags), draggedId, target.index).updates);
		tags = await listTags();
	}
}
```

wire `onReorder={reorderSidebar}` on `<NoteSidebar>`. Also in `+page.svelte`: replace `snippets={sortedSnippets}` with `snippets={snippets}` and delete the `sortedSnippets` derived + its `filterSnippets` import (the `/` menu inside the editor keeps its own favorites-first filtering — do not touch `src/lib/snippets/filter.ts` or the editor). In `newNote()`, replace `notes = [note, ...notes];` with `notes = await listNotes();` so in-memory `sortOrder`s never go stale.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:e2e -- sidebar-organization` → PASS (both tests). Run full `pnpm test:e2e` → green (`critical-flows` orderings still hold: new notes still appear on top). `pnpm test`, `pnpm check` → green/clean.

- [ ] **Step 5: Guide + commit**

Create `docs/guia/13-ordenar-y-carpetas.md`: qué es el orden manual (arrastrás y soltás; con el dedo: mantené apretado medio segundo y movés), que las listas ya no se reacomodan solas, que lo nuevo entra arriba de todo, que el orden viaja en el respaldo. Add the entry to the topic list in `docs/guia-de-uso.md` + bump its date. Commit:

```bash
git add -A
git commit -m "feat(sidebar): drag & drop manual order for notes, snippets and tags (spec 022 slice B)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Folder plans already exist — folder state + tree in the page (Slice C)

**Files:**
- Modify: `src/routes/+page.svelte`, `src/lib/components/NoteSidebar.svelte`

**Interfaces:**
- Consumes: `buildSidebarTree` (Task 3), `createFolder`/`listFolders`/`updateFolder` (Task 4).
- Produces: page state `noteFolders`, `snippetFolders` (+ refresh in the boot effect and `handleDataChanged`); `NoteSidebar` props `noteFolders`, `snippetFolders`, `onCreateFolder(view, name)`, `onRenameFolder(folder, name)`, `onToggleFolder(folder)`, `onDeleteFolder(view, folder)`; sidebar renders `buildSidebarTree` for notes and snippets. The + button opens a two-option popover.

- [ ] **Step 1: Page state and handlers**

`+page.svelte` — new state `let noteFolders = $state([]);` `let snippetFolders = $state([]);`, loaded in the boot effect (`listFolders('note')`, `listFolders('snippet')` added to the initial `Promise.all`) and refreshed in `handleDataChanged` and a new `refreshFolders()`:

```js
async function refreshFolders() {
	noteFolders = await listFolders('note');
	snippetFolders = await listFolders('snippet');
}

async function createFolderFromSidebar(view, name) {
	await createFolder(view === 'notes' ? 'note' : 'snippet', name);
	await refreshFolders();
	if (view === 'notes') notes = await listNotes();
	else snippets = await listSnippets();
}

async function renameFolderFromSidebar(folder, name) {
	await updateFolder(folder.id, { name });
	await refreshFolders();
}

async function toggleFolderFromSidebar(folder) {
	await updateFolder(folder.id, { collapsed: !folder.collapsed });
	await refreshFolders();
}

async function deleteFolderFromSidebar(view, folder) {
	const kindItems = view === 'notes' ? notes : snippets;
	const folderRows = view === 'notes' ? noteFolders : snippetFolders;
	const table = view === 'notes' ? 'notes' : 'snippets';
	const rootContainer = [
		...folderRows.map((row) => ({ id: row.id, sortOrder: row.sortOrder })),
		...kindItems
			.filter((item) => (item.folderId ?? null) === null)
			.map((item) => ({ id: item.id, sortOrder: item.sortOrder }))
	];
	const contents = kindItems.filter((item) => item.folderId === folder.id);
	const { updates } = planFolderDelete(rootContainer, $state.snapshot(contents), folder.id);
	// Root renumbering may touch folder rows AND item rows: split by id.
	const folderIds = new Set(folderRows.map((row) => row.id));
	const itemUpdates = updates.filter((update) => !folderIds.has(update.id));
	const folderUpdates = updates.filter((update) => folderIds.has(update.id));
	await deleteFolderKeepContents(folder.id, { [table]: itemUpdates });
	await applySidebarUpdates('folders', folderUpdates);
	await refreshFolders();
	if (view === 'notes') notes = await listNotes();
	else snippets = await listSnippets();
	toast.success('Carpeta borrada; su contenido volvió a la lista');
}
```

with imports `createFolder, listFolders, updateFolder, deleteFolderKeepContents` from `$lib/storage` and `planFolderDelete` from `$lib/organize`. Wire all six new props on `<NoteSidebar>`.

- [ ] **Step 2: Sidebar renders the tree + the split + button**

`NoteSidebar.svelte` — props `noteFolders = []`, `snippetFolders = []`, `onCreateFolder`, `onRenameFolder`, `onToggleFolder`, `onDeleteFolder`. Derived trees:

```js
import { buildSidebarTree } from '$lib/organize';
import { ChevronRight, Folder, FolderPlus } from '@lucide/svelte';

const noteTree = $derived(buildSidebarTree(notes, noteFolders));
const snippetTree = $derived(buildSidebarTree(snippets, snippetFolders));

let plusMenuOpen = $state(false);
let editingFolderId = $state(null);
let editingFolderValue = $state('');
```

The + button's `aria-label`/`title` for notes and snippets becomes stable and popover-oriented: **`Agregar en Notas`** and **`Agregar en Snippets`** (tags keeps `Nueva etiqueta` and its direct `creatingTag` toggle — no popover). This label change breaks earlier e2e tests that clicked the + button to create directly (Task 2 opened the snippet dialog via `Nuevo snippet`; Task 7 created notes via `Nueva nota`). Update those two existing tests in THIS task's commit to route through the popover: replace `getByRole('button', { name: 'Nuevo snippet' })` with `getByRole('button', { name: 'Agregar en Snippets' }).click()` then `getByRole('menuitem', { name: 'Nuevo snippet' }).click()`; likewise `Nueva nota` → `Agregar en Notas` + menuitem `Nueva nota`. Run `pnpm test:e2e -- sidebar-organization` after the edit to confirm the older tests pass through the new popover.

`handlePlus()` for notes/snippets now toggles `plusMenuOpen` instead of acting directly; render under the + button:

```svelte
{#if plusMenuOpen && (view === 'notes' || view === 'snippets')}
	<div class="border-border bg-background absolute top-11 right-2 z-50 flex w-44 flex-col rounded-md border p-1 shadow-md" role="menu">
		<button
			type="button"
			role="menuitem"
			onclick={() => {
				plusMenuOpen = false;
				view === 'notes' ? onCreate() : onNewSnippet();
			}}
			class="hover:bg-accent flex min-h-9 items-center gap-2 rounded-sm px-2 text-left text-sm"
		>
			<Plus size={15} aria-hidden="true" />
			{view === 'notes' ? 'Nueva nota' : 'Nuevo snippet'}
		</button>
		<button
			type="button"
			role="menuitem"
			onclick={async () => {
				plusMenuOpen = false;
				await onCreateFolder(view, 'Carpeta nueva');
			}}
			class="hover:bg-accent flex min-h-9 items-center gap-2 rounded-sm px-2 text-left text-sm"
		>
			<FolderPlus size={15} aria-hidden="true" />
			Nueva carpeta
		</button>
	</div>
{/if}
```

(add `position: relative` context on the header div, close the menu on outside click with a `$effect` window-pointerdown listener returning its cleanup, keep the tags + behavior unchanged: `view === 'tags'` still toggles `creatingTag` directly). After creating, immediately enter rename mode on the new folder: `onCreateFolder` resolves after refresh — have the page return the created folder and the sidebar set `editingFolderId = folder.id`.

Replace the notes `{#each notes as note}` with a tree walk:

```svelte
{#each noteTree as node (node.kind === 'folder' ? node.folder.id : node.item.id)}
	{#if node.kind === 'folder'}
		{@render folderRow(node, 'notes')}
		{#if !node.folder.collapsed}
			{#each node.children as note (note.id)}
				{@render noteRow(note, true)}
			{/each}
		{/if}
	{:else}
		{@render noteRow(node.item, false)}
	{/if}
{/each}
```

Extract the existing note `<li>` markup into `{#snippet noteRow(note, nested)}` adding `data-drag-id={note.id}` `data-drag-folder-id={note.folderId ?? ''}` and `class:pl-5={nested}` (indent). Same structure for snippets (`{#snippet snippetRow(snippet, nested)}`). The shared `{#snippet folderRow(node, view)}`:

```svelte
{#snippet folderRow(node, view)}
	<li
		class="group hover:bg-accent flex min-h-9 items-center gap-1 rounded-md pr-1 transition-colors duration-(--motion-fast)"
		data-drag-id={node.folder.id}
		data-drag-is-folder="true"
		data-drag-open-folder={!node.folder.collapsed}
	>
		<button
			type="button"
			aria-expanded={!node.folder.collapsed}
			aria-label="{node.folder.collapsed ? 'Abrir' : 'Cerrar'} carpeta {node.folder.name}"
			onclick={() => onToggleFolder(node.folder)}
			class="text-muted-foreground focus-visible:ring-ring flex min-h-9 flex-none items-center rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none"
		>
			<ChevronRight
				size={14}
				aria-hidden="true"
				class="transition-transform duration-(--motion-fast) {node.folder.collapsed ? '' : 'rotate-90'}"
			/>
			<Folder size={14} aria-hidden="true" class="ml-1" />
		</button>
		{#if editingFolderId === node.folder.id}
			<form
				class="flex-1"
				onsubmit={(event) => {
					event.preventDefault();
					submitFolderRename(node.folder);
				}}
			>
				<!-- svelte-ignore a11y_autofocus — the user just chose to rename. -->
				<input
					bind:value={editingFolderValue}
					aria-label="Nuevo nombre de la carpeta"
					autocomplete="off"
					autofocus
					onkeydown={(event) => {
						if (event.key === 'Escape') editingFolderId = null;
					}}
					onblur={() => submitFolderRename(node.folder)}
					class="border-border focus-visible:ring-ring min-h-7 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</form>
		{:else}
			<button
				type="button"
				aria-label="Renombrar carpeta {node.folder.name}"
				title="Renombrar"
				onclick={() => startFolderRename(node.folder)}
				class="focus-visible:ring-ring min-w-0 flex-1 truncate rounded-sm text-left text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
			>
				{node.folder.name}
				<span class="text-faint font-normal">({node.children.length})</span>
			</button>
			<button
				type="button"
				aria-label="Borrar carpeta {node.folder.name}"
				title="Borrar carpeta (el contenido vuelve a la lista)"
				onclick={() => onDeleteFolder(view, node.folder)}
				class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-sm opacity-0 max-md:opacity-100 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none md:size-7"
			>
				<Trash2 size={14} aria-hidden="true" />
			</button>
		{/if}
	</li>
{/snippet}
```

with the rename handlers mirroring the snippet ones (`startFolderRename`, `submitFolderRename` → `onRenameFolder(folder, value)` when non-empty and changed).

- [ ] **Step 3: Verify**

Run: `pnpm check` → clean. Run `pnpm test` and existing `pnpm test:e2e` → green (folders exist but nothing drags into them yet). Manual smoke: `pnpm dev`, create folder in Notas, rename, collapse, delete.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(sidebar): folders for notes and snippets — create, rename, collapse, delete (spec 022 slice C)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Drag into and out of folders (Slice C)

**Files:**
- Modify: `src/routes/+page.svelte` (extend `reorderSidebar`)
- Modify: `src/lib/components/NoteSidebar.svelte` (drag options)
- Test: extend `e2e/sidebar-organization.spec.ts`

**Interfaces:**
- Consumes: `planMoveToContainer`, `planReorder` (Task 3); `dropTarget`'s `into-folder`/`container` results (Task 6); folder wiring (Task 8).
- Produces: complete `onReorder` handling: reorder within root, reorder within a folder, move into a folder (`into-folder` → top of folder), move out (gap in root), folders themselves reorder at root but never nest.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/sidebar-organization.spec.ts`:

```ts
test('folders: file a snippet by dragging, collapse persists, delete restores contents', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Snippets' }).click();
	for (const text of ['Alfa', 'Beta']) {
		await page.getByRole('button', { name: 'Agregar en Snippets' }).click();
		await page.getByRole('menuitem', { name: 'Nuevo snippet' }).click();
		await page.getByLabel('Texto').fill(text);
		await page.getByRole('button', { name: 'Guardar snippet' }).click();
		await expect(page.getByText('Snippet guardado')).toBeVisible();
	}
	// Create a folder via the split + menu.
	await page.getByRole('button', { name: 'Agregar en Snippets' }).click();
	await page.getByRole('menuitem', { name: 'Nueva carpeta' }).click();
	const folderInput = page.getByLabel('Nuevo nombre de la carpeta');
	await folderInput.fill('Clientes');
	await folderInput.press('Enter');
	await expect(page.getByRole('button', { name: 'Renombrar carpeta Clientes' })).toBeVisible();

	// Drag "Beta" onto the folder row (its middle band).
	const library = page.getByRole('region', { name: 'Biblioteca de snippets' });
	await dragRowTo(
		page,
		library.getByRole('button', { name: 'Renombrar snippet Beta' }),
		page.getByRole('button', { name: 'Renombrar carpeta Clientes' })
	);
	await expect(page.getByText('(1)')).toBeVisible();

	// Collapse; Beta hides; reload keeps it collapsed.
	await page.getByRole('button', { name: 'Cerrar carpeta Clientes' }).click();
	await expect(library.getByRole('button', { name: 'Renombrar snippet Beta' })).toBeHidden();
	await page.reload();
	await page.getByRole('button', { name: 'Snippets' }).click();
	await expect(page.getByRole('button', { name: 'Abrir carpeta Clientes' })).toBeVisible();

	// Delete the folder: Beta returns to the root list.
	await page.getByRole('button', { name: 'Borrar carpeta Clientes' }).click();
	await expect(page.getByText('Carpeta borrada; su contenido volvió a la lista')).toBeVisible();
	await expect(library.getByRole('button', { name: 'Renombrar snippet Beta' })).toBeVisible();
});
```

The + button labels (`Agregar en Notas` / `Agregar en Snippets`) are fixed in Task 8; this test already uses them.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:e2e -- sidebar-organization` → new test FAILS (drop onto folder does nothing).

- [ ] **Step 3: Implement**

`NoteSidebar.svelte` — the notes/snippets `<ul>` attachments now allow folder drops and forbid folders nesting:

```svelte
{@attach sidebarDragList(() => ({
	onDrop: (id, target) => onReorder('snippets', id, target),
	canDropInto: (draggedId, folderId) =>
		!snippetFolders.some((folder) => folder.id === draggedId)
}))}
```

(notes list mirrors with `noteFolders`). `+page.svelte` — replace `reorderSidebar` with the full version:

```js
async function reorderSidebar(view, draggedId, target) {
	if (view === 'tags') {
		if (target.type !== 'insert') return;
		await applySidebarUpdates('tags', planReorder($state.snapshot(tags), draggedId, target.index).updates);
		tags = await listTags();
		return;
	}
	const isNotes = view === 'notes';
	const items = isNotes ? notes : snippets;
	const folderRows = isNotes ? noteFolders : snippetFolders;
	const table = isNotes ? 'notes' : 'snippets';
	const folderIds = new Set(folderRows.map((row) => row.id));
	const draggedIsFolder = folderIds.has(draggedId);

	const rootContainer = $state.snapshot([
		...folderRows.map((row) => ({ id: row.id, sortOrder: row.sortOrder })),
		...items.filter((item) => (item.folderId ?? null) === null)
	]);
	const containerOf = (folderId) =>
		folderId === null
			? rootContainer
			: $state.snapshot(items.filter((item) => item.folderId === folderId));

	let updates = [];
	if (target.type === 'into-folder') {
		if (draggedIsFolder) return; // never nest folders
		const dragged = items.find((item) => item.id === draggedId);
		const source = containerOf(dragged?.folderId ?? null);
		if ((dragged?.folderId ?? null) === target.folderId) return;
		updates = planMoveToContainer(source, containerOf(target.folderId), draggedId, 0, target.folderId).updates;
	} else {
		const dragged = draggedIsFolder ? null : items.find((item) => item.id === draggedId);
		const sourceFolder = dragged?.folderId ?? null;
		if (draggedIsFolder && target.container !== null) return; // folders live at root
		if (sourceFolder === (target.container ?? null)) {
			updates = planReorder(containerOf(sourceFolder), draggedId, target.index).updates;
		} else {
			updates = planMoveToContainer(
				containerOf(sourceFolder),
				containerOf(target.container ?? null),
				draggedId,
				target.index,
				target.container ?? null
			).updates;
		}
	}
	const folderUpdates = updates.filter((update) => folderIds.has(update.id));
	const itemUpdates = updates
		.filter((update) => !folderIds.has(update.id))
		.map(({ folderId, ...rest }) => (folderId === undefined ? rest : { ...rest, folderId }));
	await applySidebarUpdates(table, itemUpdates);
	await applySidebarUpdates('folders', folderUpdates);
	await refreshFolders();
	if (isNotes) notes = await listNotes();
	else snippets = await listSnippets();
}
```

Watch one subtlety: `planMoveToContainer`'s updates put `folderId` on the moved row only; folder rows in root renumbers never receive a `folderId` key (they're only ever in root plans as `{id, sortOrder}`) — the split above is what routes each update to its table.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:e2e -- sidebar-organization` → ALL tests PASS. Full `pnpm test:e2e`, `pnpm test`, `pnpm check` → green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sidebar): drag items into and out of folders (spec 022 slice C)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Backup roundtrip e2e + guide + closing (Slice C)

**Files:**
- Test: extend `e2e/sidebar-organization.spec.ts`
- Modify: `docs/guia/13-ordenar-y-carpetas.md`, `docs/guia-de-uso.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing (or passing-if-all-is-well) roundtrip e2e**

Append (mirror the export/import steps used in `critical-flows.spec.ts` — read its backup test first and copy its download/upload mechanics, `page.waitForEvent('download')` + `setInputFiles`):

```ts
test('backup roundtrip keeps manual order and folders', async ({ page }) => {
	await page.goto('/');
	// One folder with one note inside, one loose note in a chosen order.
	// (Build state via UI: create 2 notes, a folder, drag one in — reuse
	// dragRowTo and the Task 9 selectors.)
	// … build …
	// Export.
	const downloadPromise = page.waitForEvent('download');
	// … open Respaldo dialog, click export (copy exact labels from critical-flows) …
	const download = await downloadPromise;
	const path = await download.path();
	// Wipe: import in replace-all mode from the same dialog, then verify the
	// sidebar shows the same tree (folder name, membership, order, collapse).
	// … import via setInputFiles(path) + confirm replace …
	// Assertions: same as before the export.
});
```

This test's body must be written against the REAL labels in `BackupDialog.svelte` — read the dialog and `critical-flows.spec.ts` before writing; the comment skeleton above is the outline, the assertions on tree equality are the deliverable.

- [ ] **Step 2: Run, fix anything it catches, get to green**

Run: `pnpm test:e2e -- sidebar-organization`. If the roundtrip drops order or folders, the bug is in Task 5's normalize/merge or the dialog's `ensureSidebarOrder` calls — fix there, not in the test.

- [ ] **Step 3: Full verification sweep**

Run: `pnpm test` → all green. `pnpm test:e2e` → all green. `pnpm check` → 0 errors/warnings.

- [ ] **Step 4: Guide + commit**

`docs/guia/13-ordenar-y-carpetas.md`: add the folders section — crear carpeta desde el +, meter/sacar arrastrando, click en el nombre para renombrar, flechita para abrir/cerrar (se acuerda), borrar carpeta devuelve el contenido a la lista, todo viaja en el respaldo. Bump the index date. Commit:

```bash
git add -A
git commit -m "test(e2e): backup roundtrip for sidebar order and folders; guide for folders (spec 022)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan notes for the executor

- Task order is dependency order; do not parallelize Tasks 3–5 with 7–9.
- If `critical-flows.spec.ts` breaks on ordering assumptions (new notes on top still holds; snippet favorites no longer float in the sidebar), fix the TEST expectation and say so in the commit body — the behavior change is the feature (spec 022).
- Any deviation from this plan (renamed function, different selector, extra file) must be reported back in the task summary so the plan stays truthful.
