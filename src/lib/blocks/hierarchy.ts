// Pure block hierarchy logic, separate from the editor UI so export, copy,
// search, and future drag-and-drop can reuse it (specs/003 agent notes).
// The hierarchy lives in data (parentBlockId + order), never in DOM order.

import { sortByOrder } from './ordering';

function childrenByParent(blocks) {
	const map = new Map();
	for (const block of blocks) {
		const parent = block.parentBlockId ?? null;
		if (!map.has(parent)) map.set(parent, []);
		map.get(parent).push(block);
	}
	for (const [parent, children] of map) {
		map.set(parent, sortByOrder(children));
	}
	return map;
}

// Flatten the tree into the list the editor renders: parents before children,
// siblings by order, skipping descendants of collapsed blocks.
export function buildVisibleList(blocks) {
	const byParent = childrenByParent(blocks);
	const visible = [];
	function walk(parentId, depth) {
		for (const block of byParent.get(parentId) ?? []) {
			visible.push({ block, depth, hasChildren: byParent.has(block.id) });
			if (!block.collapsed) walk(block.id, depth + 1);
		}
	}
	walk(null, 0);
	return visible;
}

export function listDescendantIds(blocks, id) {
	const byParent = childrenByParent(blocks);
	const ids = [];
	function walk(parentId) {
		for (const block of byParent.get(parentId) ?? []) {
			ids.push(block.id);
			walk(block.id);
		}
	}
	walk(id);
	return ids;
}
