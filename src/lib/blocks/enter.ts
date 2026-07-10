// Enter/Backspace plans for the editor. Where the new block lands mirrors
// what the user sees: Enter on an expanded parent inserts a first child,
// otherwise a sibling right below.

import { buildVisibleList } from './hierarchy';
import { planInsertAfter } from './ordering';
import { sortByOrder } from './ordering';

function siblingsOf(blocks, parentBlockId) {
	const parent = parentBlockId ?? null;
	return sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
}

export function planEnter(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const children = siblingsOf(blocks, id);
	if (children.length > 0 && !target.collapsed) {
		return {
			parentBlockId: id,
			order: 0,
			updates: children.map((child) => ({ id: child.id, order: child.order + 1 }))
		};
	}
	const siblings = siblingsOf(blocks, target.parentBlockId);
	const plan = planInsertAfter(siblings, id);
	return {
		parentBlockId: target.parentBlockId ?? null,
		order: plan.order,
		updates: plan.updates
	};
}

export function canDeleteOnBackspace(blocks, id) {
	if (blocks.length <= 1) return false;
	return !blocks.some((block) => (block.parentBlockId ?? null) === id);
}

export function previousVisibleId(blocks, id) {
	const visible = buildVisibleList(blocks);
	const index = visible.findIndex((row) => row.block.id === id);
	if (index <= 0) return null;
	return visible[index - 1].block.id;
}
