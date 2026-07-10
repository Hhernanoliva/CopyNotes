// Pure ordering logic, kept separate from editor UI so export, copy,
// and future drag-and-drop can reuse it (specs/003 agent notes).

export function sortByOrder(blocks) {
	return [...blocks].sort((a, b) => a.order - b.order);
}

// Plan inserting a new sibling right after `afterId`.
// Returns the order for the new block plus the order bumps existing
// siblings need so the sequence stays gapless and stable.
export function planInsertAfter(siblings, afterId) {
	const sorted = sortByOrder(siblings);
	const index = sorted.findIndex((block) => block.id === afterId);
	if (index === -1) {
		return { order: sorted.length, updates: [] };
	}
	const order = sorted[index].order + 1;
	const updates = sorted.slice(index + 1).map((block) => ({ id: block.id, order: block.order + 1 }));
	return { order, updates };
}
