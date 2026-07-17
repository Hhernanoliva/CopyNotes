# Arrastrar renglones para mover y anidar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder and re-nest note blocks by dragging (long-press, mouse + touch), in addition to the existing Alt+Arrow moves.

**Architecture:** A pure planner (`drop.ts`) turns a resolved drop target into block `updates`; a pure resolver (`resolve.ts`) turns pointer geometry into a drop target (parent + insert index + indicator position); a Svelte controller (`dragReorder.svelte.js`) wires Pointer Events (long-press, tracking, auto-scroll, ghost/indicator state) and calls both. Editor.svelte owns apply + undo snapshot; BlockRow renders the indicator/ghost. The existing `startDrag`/`dragOver` (drag-to-**select**) is untouched.

**Tech Stack:** SvelteKit + Svelte 5 runes, plain JS in `.ts`/`.svelte`/`.svelte.js`, Vitest (unit), Playwright (e2e), Pointer Events. No new dependency.

## Global Constraints

- Svelte 5 runes only. No `onMount` for setup; use `$effect` with cleanup. Derive with `$derived`, never assign `$state` inside `$effect` to compute. Do not destructure `$state`.
- Plain JavaScript inside `.ts`/`.svelte`/`.svelte.js`: no type annotations.
- Pure logic (planners/resolvers) lives in `src/lib/blocks/`, has zero DOM references, and is tested in Node via Vitest — same pattern as `reorder.ts`/`selection.ts`.
- Block hierarchy lives in data only: `parentBlockId` + `order`. Never infer it from DOM order.
- Structural changes persist immediately via `updateBlock` (never debounced). Snapshot to `$state` must use `$state.snapshot` before any Dexie write (handled by existing `applyUpdates`/`updateBlock`).
- One `recordSnapshot()` per drag = one atomic undo step.
- Design tokens: indicator uses the `accent`/`primary` CSS variable, no hard-coded colors (Quiet Ink).
- Indent step is `1.5rem` = **24px** per depth level (`style="padding-left: {depth * 1.5}rem"` in BlockRow).
- Every user-visible change updates `docs/guia/` in the same commit.

## File Structure

- Create `src/lib/blocks/drop.ts` — `planDrop(blocks, draggedIds, newParentId, insertIndex)` → `{ updates } | null`. Pure.
- Create `src/lib/blocks/drop.test.ts` — Vitest unit tests for `planDrop`.
- Create `src/lib/blocks/resolve.ts` — `resolveDrop(rows, pointerX, pointerY, originX, indentPx)` → `{ newParentId, insertIndex, indicatorTop, indicatorDepth } | null`. Pure geometry.
- Create `src/lib/blocks/resolve.test.ts` — Vitest unit tests for `resolveDrop`.
- Create `src/lib/editor/dragReorder.svelte.js` — `createDragReorder({ getBlocks, getSelectedIds, onDrop })` controller: long-press, pointer tracking, auto-scroll, reactive ghost/indicator state.
- Modify `src/lib/editor/BlockRow.svelte` — start long-press on pointerdown of the row surface; render nothing new except a `data-block-id`-based hook (already present). Add drop-indicator slot rendering driven by props.
- Modify `src/lib/editor/Editor.svelte` — instantiate the controller, apply the plan via `applyUpdates` + `recordSnapshot`, render the floating ghost + indicator, pass indicator state to rows.
- Modify `e2e/move-blocks.spec.ts` — add drag reorder/nest e2e cases.
- Modify `docs/guia/03-escribir-y-organizar.md` and `docs/guia-de-uso.md` — document dragging.

**Existing helpers reused (exact signatures):**
- `orderedSelectionRoots(blocks, selectedIds)` → `string[]` root ids in visible order (`src/lib/blocks/selection.ts`).
- `listDescendantIds(blocks, id)` → `string[]` (`src/lib/blocks/hierarchy.ts`).
- `buildVisibleList(blocks)` → `{ block, depth, hasChildren }[]` (`src/lib/blocks/hierarchy.ts`).
- `sortByOrder(blocks)` → sorted copy (`src/lib/blocks/ordering.ts`).
- `applyUpdates(updates)` in Editor.svelte: `for {id, ...changes}` → mutates local `blocks` + `await updateBlock`.
- `recordSnapshot()` in Editor.svelte: pushes an undo snapshot.

---

### Task 1: `planDrop` pure planner

**Files:**
- Create: `src/lib/blocks/drop.ts`
- Test: `src/lib/blocks/drop.test.ts`

**Interfaces:**
- Consumes: `orderedSelectionRoots`, `listDescendantIds`, `sortByOrder`.
- Produces: `planDrop(blocks, draggedIds, newParentId, insertIndex)` → `{ updates: {id, parentBlockId?, order?}[] } | null`. `null` = invalid drop (into self/descendant). Empty `updates` = no-op (dropped in place).

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/blocks/drop.test.ts
import { describe, expect, it } from 'vitest';
import { planDrop } from './drop';

function block(id, parentBlockId = null, order = 0) {
	return { id, parentBlockId, order };
}

describe('planDrop', () => {
	it('reorders a root among its siblings', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('c', null, 2)];
		// move c to index 0 at root
		const plan = planDrop(blocks, ['c'], null, 0);
		expect(plan.updates).toContainEqual({ id: 'c', parentBlockId: null, order: 0 });
		expect(plan.updates).toContainEqual({ id: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
	});

	it('nests a block as a child of another', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		// drop b as first child of a
		const plan = planDrop(blocks, ['b'], 'a', 0);
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 0 });
	});

	it('outdents a child to the root', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		// drop a1 at root between a (0) and b (was 1) -> index 1
		const plan = planDrop(blocks, ['a1'], null, 1);
		expect(plan.updates).toContainEqual({ id: 'a1', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
	});

	it('returns null when dropping a block into itself', () => {
		const blocks = [block('a', null, 0)];
		expect(planDrop(blocks, ['a'], 'a', 0)).toBeNull();
	});

	it('returns null when dropping a block into its own descendant', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		expect(planDrop(blocks, ['a'], 'a1x', 0)).toBeNull();
	});

	it('moves only selection roots; children follow via parentBlockId', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('b', null, 1)
		];
		// drag a (root) + a1 (its child) as a group; only a is a root
		const plan = planDrop(blocks, ['a', 'a1'], null, 1);
		// a re-homed after b; a1 not re-parented (still child of a)
		expect(plan.updates).toContainEqual({ id: 'a', parentBlockId: null, order: 1 });
		expect(plan.updates.find((u) => u.id === 'a1' && 'parentBlockId' in u)).toBeUndefined();
	});

	it('renumbers the old parent gapless after a child leaves', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('b', null, 1)
		];
		const plan = planDrop(blocks, ['a1'], null, 1);
		expect(plan.updates).toContainEqual({ id: 'a2', order: 0 }); // was 1, now gapless
	});

	it('returns empty updates when dropped in the same place', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planDrop(blocks, ['b'], null, 1); // b already index 1 at root
		expect(plan.updates).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/lib/blocks/drop.test.ts`
Expected: FAIL — `planDrop is not a function` / module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/blocks/drop.ts
// Pure drop planner for drag-and-drop reorder + nest. Reuses the same
// data model as reorder.ts/selection.ts: hierarchy is parentBlockId + order.
// Given a fully resolved target (new parent + index among that parent's
// children), it produces gapless order updates and re-parents the dragged
// roots. Children follow their root by id, so only roots are re-homed.

import { sortByOrder } from './ordering';
import { orderedSelectionRoots } from './selection';
import { listDescendantIds } from './hierarchy';

function childIds(blocks, parentId) {
	const parent = parentId ?? null;
	return sortByOrder(blocks.filter((b) => (b.parentBlockId ?? null) === parent)).map((b) => b.id);
}

export function planDrop(blocks, draggedIds, newParentId, insertIndex) {
	const parent = newParentId ?? null;
	const roots = orderedSelectionRoots(blocks, draggedIds);
	if (roots.length === 0) return null;

	// Cycle / self guard: the new parent can't be a dragged root or inside one.
	const forbidden = new Set();
	for (const id of roots) {
		forbidden.add(id);
		for (const d of listDescendantIds(blocks, id)) forbidden.add(d);
	}
	if (parent !== null && forbidden.has(parent)) return null;

	const rootSet = new Set(roots);
	// Target parent's current children, minus any dragged roots already there.
	const targetKept = childIds(blocks, parent).filter((id) => !rootSet.has(id));
	const clampedIndex = Math.max(0, Math.min(insertIndex, targetKept.length));
	const finalOrder = [
		...targetKept.slice(0, clampedIndex),
		...roots,
		...targetKept.slice(clampedIndex)
	];

	const byId = new Map(blocks.map((b) => [b.id, b]));
	const updates = [];

	// Assign gapless orders + re-parent roots in the target parent.
	finalOrder.forEach((id, index) => {
		const b = byId.get(id);
		const isRoot = rootSet.has(id);
		const newParentChanged = isRoot && (b.parentBlockId ?? null) !== parent;
		if (b.order !== index || newParentChanged) {
			const update = { id, order: index };
			if (isRoot) update.parentBlockId = parent;
			updates.push(update);
		}
	});

	// Renumber every OLD parent a root left behind (skip the target parent,
	// already renumbered above).
	const oldParents = new Set(
		roots.map((id) => byId.get(id).parentBlockId ?? null).filter((p) => p !== parent)
	);
	for (const oldParent of oldParents) {
		const kept = childIds(blocks, oldParent).filter((id) => !rootSet.has(id));
		kept.forEach((id, index) => {
			const b = byId.get(id);
			if (b.order !== index && !updates.some((u) => u.id === id)) {
				updates.push({ id, order: index });
			}
		});
	}

	return { updates };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/lib/blocks/drop.test.ts`
Expected: PASS — 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/drop.ts src/lib/blocks/drop.test.ts
git commit -m "feat(blocks): pure planDrop planner for drag reorder+nest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `resolveDrop` pure geometry resolver

**Files:**
- Create: `src/lib/blocks/resolve.ts`
- Test: `src/lib/blocks/resolve.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained math).
- Produces: `resolveDrop(rows, pointerX, pointerY, originX, indentPx)` → `{ newParentId, insertIndex, indicatorTop, indicatorDepth } | null`.
  - `rows`: visible rows **excluding dragged**, each `{ id, depth, hasChildren, top, height }` (px, `top` in the same coordinate space as `pointerY`).
  - `originX`: left px of the list content (depth 0 text start), same space as `pointerX`.
  - `indentPx`: px per depth level (24).
  - Returned `newParentId`/`insertIndex` feed straight into `planDrop`. `indicatorTop`/`indicatorDepth` position the on-screen indicator. `null` if `rows` is empty.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/blocks/resolve.test.ts
import { describe, expect, it } from 'vitest';
import { resolveDrop } from './resolve';

// three flat root rows, 20px tall each, stacked from top 0
const flat = [
	{ id: 'a', depth: 0, hasChildren: false, top: 0, height: 20 },
	{ id: 'b', depth: 0, hasChildren: false, top: 20, height: 20 },
	{ id: 'c', depth: 0, hasChildren: false, top: 40, height: 20 }
];

describe('resolveDrop', () => {
	it('returns null for an empty list', () => {
		expect(resolveDrop([], 0, 0, 0, 24)).toBeNull();
	});

	it('drops before the first row when pointer is above all midpoints', () => {
		const r = resolveDrop(flat, 0, 2, 0, 24); // y=2 above a's midpoint (10)
		expect(r.newParentId).toBeNull();
		expect(r.insertIndex).toBe(0);
	});

	it('drops between rows a and b at the gap after a', () => {
		const r = resolveDrop(flat, 0, 15, 0, 24); // past a midpoint, before b midpoint
		expect(r.newParentId).toBeNull();
		expect(r.insertIndex).toBe(1);
	});

	it('nests as child of the previous row when dragged right', () => {
		const prevHasKids = [
			{ id: 'a', depth: 0, hasChildren: false, top: 0, height: 20 },
			{ id: 'b', depth: 0, hasChildren: false, top: 20, height: 20 }
		];
		// gap after a (y=15), pointerX one indent right of origin -> depth 1 under a
		const r = resolveDrop(prevHasKids, 24, 15, 0, 24);
		expect(r.newParentId).toBe('a');
		expect(r.insertIndex).toBe(0);
		expect(r.indicatorDepth).toBe(1);
	});

	it('clamps depth to previous row depth + 1', () => {
		const r = resolveDrop(flat, 999, 15, 0, 24); // far right after a (depth 0)
		expect(r.indicatorDepth).toBe(1); // can't be deeper than a child of a
		expect(r.newParentId).toBe('a');
	});

	it('outdents to an ancestor when dragged left in a nested gap', () => {
		const nested = [
			{ id: 'a', depth: 0, hasChildren: true, top: 0, height: 20 },
			{ id: 'a1', depth: 1, hasChildren: false, top: 20, height: 20 },
			{ id: 'b', depth: 0, hasChildren: false, top: 40, height: 20 }
		];
		// gap after a1 (y=35), pointerX at origin -> depth 0 -> sibling of a
		const r = resolveDrop(nested, 0, 35, 0, 24);
		expect(r.newParentId).toBeNull();
		expect(r.indicatorDepth).toBe(0);
		expect(r.insertIndex).toBe(1); // after a at root
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --run src/lib/blocks/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/blocks/resolve.ts
// Pure geometry: turn pointer coordinates over the (dragged-excluded) visible
// list into a concrete drop target for planDrop. Y picks the gap between two
// rows; X picks the nesting depth, clamped to what is structurally legal
// there (between the next row's depth and the previous row's depth + 1).

export function resolveDrop(rows, pointerX, pointerY, originX, indentPx) {
	if (rows.length === 0) return null;

	// Gap index = how many rows have their vertical midpoint above the pointer.
	let gap = 0;
	for (const row of rows) {
		if (pointerY >= row.top + row.height / 2) gap += 1;
		else break;
	}

	const prev = gap > 0 ? rows[gap - 1] : null;
	const next = gap < rows.length ? rows[gap] : null;

	// Legal depth range for this gap.
	const maxDepth = prev ? prev.depth + 1 : 0;
	const minDepth = next ? next.depth : 0;
	const rawDepth = Math.round((pointerX - originX) / indentPx);
	const depth = Math.max(minDepth, Math.min(rawDepth, maxDepth));

	// Parent = nearest row at or above the gap whose depth is depth-1.
	let newParentId = null;
	if (depth > 0) {
		for (let i = gap - 1; i >= 0; i -= 1) {
			if (rows[i].depth === depth - 1) {
				newParentId = rows[i].id;
				break;
			}
		}
	}

	// insertIndex = count of that parent's direct children strictly above the gap.
	let insertIndex = 0;
	for (let i = 0; i < gap; i += 1) {
		const row = rows[i];
		const rowParentIsTarget =
			depth === 0 ? row.depth === 0 : row.depth === depth && parentAbove(rows, i, depth) === newParentId;
		if (rowParentIsTarget) insertIndex += 1;
	}

	const indicatorTop = prev ? prev.top + prev.height : rows[0].top;
	return { newParentId, insertIndex, indicatorTop, indicatorDepth: depth };
}

// Nearest row above index i whose depth is targetDepth-1 (that row's parent id).
function parentAbove(rows, i, targetDepth) {
	for (let k = i - 1; k >= 0; k -= 1) {
		if (rows[k].depth === targetDepth - 1) return rows[k].id;
	}
	return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --run src/lib/blocks/resolve.test.ts`
Expected: PASS — 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/resolve.ts src/lib/blocks/resolve.test.ts
git commit -m "feat(blocks): pure resolveDrop geometry for drag targets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Drag controller + Editor/BlockRow wiring

**Files:**
- Create: `src/lib/editor/dragReorder.svelte.js`
- Modify: `src/lib/editor/BlockRow.svelte` (pointerdown to arm long-press; render indicator line)
- Modify: `src/lib/editor/Editor.svelte` (instantiate controller, apply plan, floating ghost)

**Interfaces:**
- Consumes: `resolveDrop` (Task 2), `planDrop` (Task 1), `buildVisibleList`, `orderedSelectionRoots`, Editor's `applyUpdates`, `recordSnapshot`, local `blocks`, `selectedIds`.
- Produces: `createDragReorder({ getBlocks, getSelectedIds, listEl, onApply })` → object with:
  - `armFromPointer(blockId, event)` — call on a row's `pointerdown`; starts the ~350ms long-press timer with a ~6px cancel threshold.
  - reactive getters `active` (bool), `indicator` (`{ top, depth } | null`), `ghost` (`{ x, y, ids } | null`).
  - The controller adds its own window `pointermove`/`pointerup`/`keydown(Escape)` listeners while armed/active and removes them on end.
  - `onApply(plan)` is called with the `planDrop` result on release; Editor runs `recordSnapshot()` + `applyUpdates`.

- [ ] **Step 1: Write the controller**

```js
// src/lib/editor/dragReorder.svelte.js
// Pointer-Events drag controller for block reorder + nest. Long-press to arm
// (works for mouse and touch on one path), then track the pointer to drive a
// live indicator and a floating ghost. On release it asks planDrop for the
// update plan and hands it to the editor. Escape or an out-of-list release
// cancels with no changes. All hierarchy math is delegated to the pure
// resolveDrop/planDrop; this file only measures the DOM and holds UI state.

import { buildVisibleList, orderedSelectionRoots } from '$lib/blocks/hierarchy';
import { resolveDrop } from '$lib/blocks/resolve';
import { planDrop } from '$lib/blocks/drop';

const HOLD_MS = 350;
const MOVE_CANCEL_PX = 6;
const INDENT_PX = 24; // 1.5rem
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_SPEED = 8;

export function createDragReorder({ getBlocks, getSelectedIds, getListEl, onApply }) {
	let active = $state(false);
	let indicator = $state(null); // { top, depth }
	let ghost = $state(null); // { x, y, ids }

	let holdTimer = null;
	let startX = 0;
	let startY = 0;
	let draggedIds = [];
	let scrollRAF = null;

	function cleanup() {
		clearTimeout(holdTimer);
		holdTimer = null;
		if (scrollRAF) cancelAnimationFrame(scrollRAF);
		scrollRAF = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('keydown', onKey);
	}

	function reset() {
		cleanup();
		active = false;
		indicator = null;
		ghost = null;
		draggedIds = [];
	}

	// Called from a row's pointerdown. Arms the hold timer; a quick drag past
	// MOVE_CANCEL_PX before it fires means "select text / scroll", not "move".
	function armFromPointer(blockId, event) {
		if (event.button != null && event.button !== 0) return; // primary only
		startX = event.clientX;
		startY = event.clientY;
		const selected = getSelectedIds();
		const ids = selected.includes(blockId) ? selected : [blockId];
		draggedIds = orderedSelectionRoots(getBlocks(), ids);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		holdTimer = setTimeout(() => {
			holdTimer = null;
			active = true;
			ghost = { x: startX, y: startY, ids: draggedIds };
			if (navigator.vibrate) navigator.vibrate(8);
			window.getSelection()?.removeAllRanges();
			update(startX, startY);
		}, HOLD_MS);
	}

	function onMove(event) {
		if (!active) {
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) reset(); // cancel arming
			return;
		}
		event.preventDefault();
		update(event.clientX, event.clientY);
		autoScroll(event.clientY);
	}

	// Measure the visible rows (excluding dragged) and resolve the target.
	function update(clientX, clientY) {
		const listEl = getListEl();
		if (!listEl) return;
		const draggedSet = new Set(draggedIds);
		const rows = [];
		let originX = Infinity;
		for (const { block, depth, hasChildren } of buildVisibleList(getBlocks())) {
			if (draggedSet.has(block.id)) continue;
			const el = listEl.querySelector(`[data-block-id="${block.id}"]`);
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			rows.push({ id: block.id, depth, hasChildren, top: rect.top, height: rect.height });
			originX = Math.min(originX, rect.left - depth * INDENT_PX);
		}
		ghost = { x: clientX, y: clientY, ids: draggedIds };
		const target = resolveDrop(rows, clientX, clientY, originX, INDENT_PX);
		indicator = target ? { top: target.indicatorTop, depth: target.indicatorDepth } : null;
	}

	function autoScroll(clientY) {
		const listEl = getListEl();
		const scroller = listEl?.closest('[data-scroll-container]') ?? document.scrollingElement;
		if (!scroller) return;
		const rect = scroller.getBoundingClientRect ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
		let delta = 0;
		if (clientY < rect.top + AUTOSCROLL_EDGE_PX) delta = -AUTOSCROLL_SPEED;
		else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) delta = AUTOSCROLL_SPEED;
		if (scrollRAF) cancelAnimationFrame(scrollRAF);
		if (delta === 0) return;
		const step = () => {
			scroller.scrollBy(0, delta);
			scrollRAF = requestAnimationFrame(step);
		};
		scrollRAF = requestAnimationFrame(step);
	}

	function onUp(event) {
		if (!active) {
			reset();
			return;
		}
		const listEl = getListEl();
		const draggedSet = new Set(draggedIds);
		const rows = [];
		let originX = Infinity;
		for (const { block, depth, hasChildren } of buildVisibleList(getBlocks())) {
			if (draggedSet.has(block.id)) continue;
			const el = listEl?.querySelector(`[data-block-id="${block.id}"]`);
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			rows.push({ id: block.id, depth, hasChildren, top: rect.top, height: rect.height });
			originX = Math.min(originX, rect.left - depth * INDENT_PX);
		}
		const target = resolveDrop(rows, event.clientX, event.clientY, originX, INDENT_PX);
		const ids = draggedIds;
		reset();
		if (!target) return;
		const plan = planDrop(getBlocks(), ids, target.newParentId, target.insertIndex);
		if (plan && plan.updates.length > 0) onApply(plan);
	}

	function onKey(event) {
		if (event.key === 'Escape') reset();
	}

	return {
		armFromPointer,
		get active() {
			return active;
		},
		get indicator() {
			return indicator;
		},
		get ghost() {
			return ghost;
		},
		destroy: reset
	};
}
```

- [ ] **Step 2: Wire BlockRow to arm the drag**

In `src/lib/editor/BlockRow.svelte`, add an `onDragHold` prop alongside the existing block props (near `onPlainMousedown` in the `let { ... } = $props()` block):

```js
	onDragHold,
```

On the row root `<div data-block-id={block.id} ...>` (around line 410), add a `pointerdown` handler that arms the drag without stealing the caret click:

```svelte
	onpointerdown={(event) => onDragHold?.(block.id, event)}
```

The existing `handleMousedown` (caret/select) stays; long-press only fires the drag after the hold delay, and a normal quick click still lands the caret because arming cancels on the click's `pointerup` before the timer.

- [ ] **Step 3: Wire Editor to instantiate the controller and render ghost + indicator**

In `src/lib/editor/Editor.svelte`:

a) Import and create the controller (near the other imports and after `blocks`/`selectedIds` state exist):

```js
	import { createDragReorder } from './dragReorder.svelte.js';

	let listEl;

	const reorder = createDragReorder({
		getBlocks: () => blocks,
		getSelectedIds: () => selectedIds,
		getListEl: () => listEl,
		onApply: async (plan) => {
			recordSnapshot();
			await applyUpdates(plan.updates);
		}
	});

	$effect(() => () => reorder.destroy());
```

b) Bind the list container and give it a scroll hook. Change the list wrapper (line ~1339) to:

```svelte
	<div class="mt-6 flex flex-col" bind:this={listEl}>
```

c) Pass the arm handler to each `<BlockRow>` (in the `{#each visible ...}` props list, alongside `onPlainMousedown`):

```svelte
					onDragHold={(id, event) => reorder.armFromPointer(id, event)}
```

d) Render the indicator line and floating ghost. Immediately after the `{/each}` that closes the block list, still inside the list `<div>`:

```svelte
		{#if reorder.indicator}
			<div
				class="pointer-events-none absolute h-0.5 bg-primary"
				style="left: {reorder.indicator.depth * 1.5}rem; right: 0; top: {reorder.indicator.top}px;"
			></div>
		{/if}
```

Note: give the list `<div>` `class="... relative"` so the indicator's absolute `top` is measured against it. Because `resolveDrop` returns viewport `top`, convert in the indicator by subtracting the list's own top — simplest is to store `indicatorTop` relative to the list: in the controller's `update`/`onUp`, after building `rows`, subtract `listEl.getBoundingClientRect().top` from each row's `top` before calling `resolveDrop`, and add it back only for `ghost` (which is `position: fixed`). Apply that offset so the indicator sits correctly.

For the ghost, render at the document root of the editor (fixed positioning, follows the pointer):

```svelte
	{#if reorder.ghost}
		<div
			class="pointer-events-none fixed z-50 rounded-md bg-card px-2 py-1 text-sm opacity-80 shadow-lg"
			style="left: {reorder.ghost.x + 12}px; top: {reorder.ghost.y + 12}px;"
		>
			Moviendo {reorder.ghost.ids.length} {reorder.ghost.ids.length === 1 ? 'renglón' : 'renglones'}
		</div>
	{/if}
```

- [ ] **Step 4: Manual smoke test in the app**

Run: `npm run dev`, open a note with a few nested blocks.
Expected: press-and-hold a line ~⅓s → a ghost appears and a thin accent line shows the drop spot; dragging right nests, left outdents; release moves it; a quick click still just places the caret; Ctrl+Z undoes the whole move.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/dragReorder.svelte.js src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte
git commit -m "feat(editor): drag-to-reorder-and-nest blocks (long-press, mouse+touch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: e2e coverage + user guide

**Files:**
- Modify: `e2e/move-blocks.spec.ts`
- Modify: `docs/guia/03-escribir-y-organizar.md`
- Modify: `docs/guia-de-uso.md`

**Interfaces:**
- Consumes: the shipped drag behavior from Task 3. No new code exports.

- [ ] **Step 1: Add e2e drag tests**

Append to `e2e/move-blocks.spec.ts` (reuse the file's existing setup/helpers; mirror how it seeds blocks and reads order). Drive the drag with real Pointer Events at a slow, held pace so the ~350ms hold fires:

```js
test('drag a line to reorder it', async ({ page }) => {
	// seed three lines a / b / c following the file's existing pattern, then:
	const c = page.locator('[data-block-id]').nth(2);
	const a = page.locator('[data-block-id]').nth(0);
	const cBox = await c.boundingBox();
	const aBox = await a.boundingBox();
	await page.mouse.move(cBox.x + 10, cBox.y + cBox.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(400); // exceed HOLD_MS
	await page.mouse.move(aBox.x + 10, aBox.y + 2, { steps: 8 }); // above first line
	await page.mouse.up();
	// assert the first visible line is now the one that was third
	await expect(page.locator('[data-block-id]').first()).toHaveText(/c/);
});

test('a quick drag selects text and does not move the line', async ({ page }) => {
	// mouse.down on a line, move a few px immediately (no wait), mouse.up
	// assert the order is unchanged.
});

test('dragging right nests the line under the previous one', async ({ page }) => {
	// hold + move right by ~24px into the gap under the previous line,
	// release, assert the moved line renders indented (padding-left > 0)
	// or query its parentBlockId via the app's debug hook if available.
});
```

Fill the seeding/order-reading using the same helpers already in `move-blocks.spec.ts` (do not invent new ones — read the file first). Keep assertions on visible text/indent, matching the file's style.

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e -- move-blocks`
Expected: PASS — existing Alt+Arrow tests plus the 3 new drag tests.

- [ ] **Step 3: Update the user guide (same commit)**

In `docs/guia/03-escribir-y-organizar.md`, under the "Mover renglones" section, add a plain-Spanish paragraph:

```markdown
También podés **arrastrar** un renglón para moverlo: mantené presionado sobre
el renglón (con el mouse o el dedo) un instante hasta que se "despegue", y sin
soltar llevalo a donde quieras. Una línea fina te muestra dónde va a caer.
Si lo movés hacia la derecha queda **dentro** del renglón de arriba (como sub-punto);
hacia la izquierda **sale** hacia afuera. Si tenías varios renglones seleccionados,
se mueven todos juntos. Soltá fuera de la lista o apretá Escape para cancelar.
```

In `docs/guia-de-uso.md`, update the "Última actualización" date to `2026-07-17`.

- [ ] **Step 4: Full test suite green**

Run: `npm run test -- --run`
Expected: PASS — all unit tests (existing + `drop.test.ts` + `resolve.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add e2e/move-blocks.spec.ts docs/guia/03-escribir-y-organizar.md docs/guia-de-uso.md
git commit -m "test(e2e): drag reorder+nest coverage; docs: guide for dragging lines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** reorder+nest (Task 1+2+3), long-press arm + 6px cancel (Task 3 controller), group drag via `orderedSelectionRoots` (Task 1+3), touch via Pointer Events single path (Task 3), ghost + accent indicator + auto-scroll (Task 3), cycle/self guard → null (Task 1), collapsed subtree moves whole (roots-only re-home carries hidden children by id — inherent in Task 1; expanding a collapsed new parent is an accepted follow-up if needed, noted below), in-place drop = empty updates/no undo (Task 1), atomic undo snapshot (Task 3 onApply), immediate persistence (`applyUpdates`), tests pure + e2e (Task 1/2/4), guide in same commit (Task 4). All covered.
- **Open follow-up (not blocking):** if a block is dropped as a child of a *collapsed* parent, expanding that parent (as indent does today) can be added in Task 3's `onApply` by clearing `collapsed` on `target.newParentId`. Left as a small enhancement; the move itself is correct without it.
- **Type consistency:** `planDrop(blocks, draggedIds, newParentId, insertIndex)` and `resolveDrop(...) → { newParentId, insertIndex, indicatorTop, indicatorDepth }` line up: resolver output feeds planner input by name. Controller uses both with those exact names.
```
