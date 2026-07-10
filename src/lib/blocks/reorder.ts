// Reorder plans: swap a block with its adjacent sibling. The whole subtree
// follows because children reference the moved block's id, not its order.
// Drag-and-drop UI will reuse these plans later (specs/017).

import { sortByOrder } from './ordering';

function planSwap(blocks, id, offset) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const parent = target.parentBlockId ?? null;
	const siblings = sortByOrder(
		blocks.filter((block) => (block.parentBlockId ?? null) === parent)
	);
	const index = siblings.findIndex((block) => block.id === id);
	const other = siblings[index + offset];
	if (!other) return null;
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
