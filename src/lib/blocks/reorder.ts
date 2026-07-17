// Reorder plans: swap a block with its adjacent sibling; at the parent's edge
// the block escapes the parent instead (Workflowy-style), landing right above
// or below it as its sibling. The whole subtree follows because children
// reference the moved block's id, not its order. Drag-and-drop UI will reuse
// these plans later (specs/017).

import { sortByOrder } from './ordering';

function siblingsOf(blocks, parentBlockId) {
	const parent = parentBlockId ?? null;
	return sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
}

// The target leaves its parent and becomes the parent's sibling: right above
// it (offset -1) or right below its whole subtree (offset +1). At the root
// there is no parent to escape, so the move stops there.
function planEscape(blocks, target, offset) {
	const parentId = target.parentBlockId ?? null;
	if (parentId === null) return null;
	const parent = blocks.find((block) => block.id === parentId);
	if (!parent) return null;
	const oldSiblings = siblingsOf(blocks, parentId);
	const index = oldSiblings.findIndex((block) => block.id === target.id);
	const parentSiblings = siblingsOf(blocks, parent.parentBlockId);
	const parentIndex = parentSiblings.findIndex((block) => block.id === parent.id);
	const updates = [];
	if (offset < 0) {
		updates.push({ id: target.id, parentBlockId: parent.parentBlockId ?? null, order: parent.order });
		for (const later of parentSiblings.slice(parentIndex)) {
			updates.push({ id: later.id, order: later.order + 1 });
		}
	} else {
		updates.push({
			id: target.id,
			parentBlockId: parent.parentBlockId ?? null,
			order: parent.order + 1
		});
		for (const later of parentSiblings.slice(parentIndex + 1)) {
			updates.push({ id: later.id, order: later.order + 1 });
		}
	}
	// Renumber the siblings left behind so the sequence stays gapless.
	for (const later of oldSiblings.slice(index + 1)) {
		updates.push({ id: later.id, order: later.order - 1 });
	}
	return { updates };
}

function planSwap(blocks, id, offset) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const parent = target.parentBlockId ?? null;
	const siblings = siblingsOf(blocks, parent);
	const index = siblings.findIndex((block) => block.id === id);
	const other = siblings[index + offset];
	if (!other) return planEscape(blocks, target, offset);
	return {
		updates: [
			{ id, order: other.order },
			{ id: other.id, order: target.order }
		]
	};
}

export function planMoveUp(blocks, id) {
	return planSwap(blocks, id, -1);
}

export function planMoveDown(blocks, id) {
	return planSwap(blocks, id, 1);
}
