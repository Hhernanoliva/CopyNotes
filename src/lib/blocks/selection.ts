// Multi-block selection logic (editor UX pass, slice C). Pure so copy, delete
// and move over a selection can be tested without the editor and can never
// silently corrupt the parent-child hierarchy.

import { sortByOrder } from './ordering';
import { buildVisibleList, listDescendantIds } from './hierarchy';

function visibleIds(blocks) {
	return buildVisibleList(blocks).map((row) => row.block.id);
}

// Visible block ids between anchor and focus, inclusive, in visible order.
// Collapsed descendants are hidden, so they never sneak into a range.
export function selectionRange(blocks, anchorId, focusId) {
	const visible = visibleIds(blocks);
	const a = visible.indexOf(anchorId);
	const b = visible.indexOf(focusId);
	if (a === -1 || b === -1) return [];
	const [lo, hi] = a <= b ? [a, b] : [b, a];
	return visible.slice(lo, hi + 1);
}

// Neighbour visible block id: direction 1 = down, -1 = up. Null past an edge.
export function neighborVisibleId(blocks, id, direction) {
	const visible = visibleIds(blocks);
	const index = visible.indexOf(id);
	if (index === -1) return null;
	const next = index + direction;
	return next >= 0 && next < visible.length ? visible[next] : null;
}

// Selection roots: selected blocks whose parent is not also selected. A
// selected parent already carries its children, so those are the movable units.
function selectionRoots(blocks, selectedIds) {
	const set = new Set(selectedIds);
	return blocks.filter((block) => set.has(block.id) && !set.has(block.parentBlockId ?? null));
}

// Root ids of the selection in visible (top-to-bottom) order. Copy uses this:
// each root is formatted with its subtree, in the order the user sees them.
export function orderedSelectionRoots(blocks, selectedIds) {
	const set = new Set(selectedIds);
	const rootIds = new Set(
		blocks
			.filter((block) => set.has(block.id) && !set.has(block.parentBlockId ?? null))
			.map((block) => block.id)
	);
	return visibleIds(blocks).filter((id) => rootIds.has(id));
}

// Every id to soft-delete: the selection plus all descendants (never orphan a
// child by deleting only its parent).
export function planDeleteSelection(blocks, selectedIds) {
	const set = new Set(selectedIds);
	for (const id of selectedIds) {
		for (const descendantId of listDescendantIds(blocks, id)) set.add(descendantId);
	}
	return [...set];
}

// Move a contiguous run of sibling roots up or down among their siblings.
// Returns null when the move is undefined: roots span parents, are not a
// contiguous run, or are already at the edge. Subtrees follow via parentBlockId.
export function planMoveSelection(blocks, selectedIds, direction) {
	const roots = selectionRoots(blocks, selectedIds);
	if (roots.length === 0) return null;
	const parent = roots[0].parentBlockId ?? null;
	if (roots.some((root) => (root.parentBlockId ?? null) !== parent)) return null;

	const siblings = sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
	const rootIds = new Set(roots.map((root) => root.id));
	const indices = siblings.map((block, i) => (rootIds.has(block.id) ? i : -1)).filter((i) => i >= 0);
	const contiguous = indices.every((value, k) => k === 0 || value === indices[k - 1] + 1);
	if (!contiguous) return null;

	const first = indices[0];
	const last = indices[indices.length - 1];
	const group = siblings.slice(first, last + 1);

	let reordered;
	if (direction < 0) {
		if (first === 0) return null;
		const above = siblings[first - 1];
		reordered = [...siblings.slice(0, first - 1), ...group, above, ...siblings.slice(last + 1)];
	} else {
		if (last === siblings.length - 1) return null;
		const below = siblings[last + 1];
		reordered = [...siblings.slice(0, first), below, ...group, ...siblings.slice(last + 2)];
	}

	const updates = [];
	reordered.forEach((block, index) => {
		if (block.order !== index) updates.push({ id: block.id, order: index });
	});
	return { updates };
}
