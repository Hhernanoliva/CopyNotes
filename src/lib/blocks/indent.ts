// Tab / Shift+Tab plans. Each plan is a list of { id, ...changes } updates
// the editor applies to state and storage in one pass. Children of the moved
// block follow it implicitly because they point at its id.

import { sortByOrder } from './ordering';

function siblingsOf(blocks, parentBlockId) {
	const parent = parentBlockId ?? null;
	return sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
}

export function planIndent(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const siblings = siblingsOf(blocks, target.parentBlockId);
	const index = siblings.findIndex((block) => block.id === id);
	if (index <= 0) return null;
	const newParent = siblings[index - 1];
	const newSiblings = siblingsOf(blocks, newParent.id);
	const updates = [];
	updates.push({ id, parentBlockId: newParent.id, order: newSiblings.length });
	for (const later of siblings.slice(index + 1)) {
		updates.push({ id: later.id, order: later.order - 1 });
	}
	return { updates };
}

export function planOutdent(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target || (target.parentBlockId ?? null) === null) return null;
	const parent = blocks.find((block) => block.id === target.parentBlockId);
	if (!parent) return null;
	const oldSiblings = siblingsOf(blocks, parent.id);
	const index = oldSiblings.findIndex((block) => block.id === id);
	const parentSiblings = siblingsOf(blocks, parent.parentBlockId);
	const parentIndex = parentSiblings.findIndex((block) => block.id === parent.id);
	const updates = [];
	updates.push({ id, parentBlockId: parent.parentBlockId ?? null, order: parent.order + 1 });
	for (const later of parentSiblings.slice(parentIndex + 1)) {
		updates.push({ id: later.id, order: later.order + 1 });
	}
	for (const later of oldSiblings.slice(index + 1)) {
		updates.push({ id: later.id, order: later.order - 1 });
	}
	return { updates };
}
