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
	const find = (id) => blocks.find((b) => b.id === id);
	// Target parent's current children, minus any dragged roots already there.
	const targetKept = childIds(blocks, parent).filter((id) => !rootSet.has(id));
	const clampedIndex = Math.max(0, Math.min(insertIndex, targetKept.length));
	const finalOrder = [
		...targetKept.slice(0, clampedIndex),
		...roots,
		...targetKept.slice(clampedIndex)
	];

	const updates = [];

	// Assign gapless orders + re-parent roots in the target parent.
	finalOrder.forEach((id, index) => {
		const b = find(id);
		const isRoot = rootSet.has(id);
		const newParentChanged = isRoot && (b.parentBlockId ?? null) !== parent;
		if (b.order !== index || newParentChanged) {
			updates.push(isRoot ? { id, order: index, parentBlockId: parent } : { id, order: index });
		}
	});

	// Renumber every OLD parent a root left behind (skip the target parent,
	// already renumbered above).
	const oldParents = new Set(
		roots.map((id) => find(id).parentBlockId ?? null).filter((p) => p !== parent)
	);
	for (const oldParent of oldParents) {
		const kept = childIds(blocks, oldParent).filter((id) => !rootSet.has(id));
		kept.forEach((id, index) => {
			const b = find(id);
			if (b.order !== index && !updates.some((u) => u.id === id)) {
				updates.push({ id, order: index });
			}
		});
	}

	return { updates };
}
