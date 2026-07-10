// Todo cascade rules from specs/003: checking a parent todo checks its todo
// descendants, completing the last todo child auto-checks the parent, and
// unchecking a child unchecks its todo ancestors. The cascade only travels
// through todo→todo edges; any other block type breaks the chain.

export function planToggleChecked(blocks, id) {
	const byId = new Map();
	for (const block of blocks) byId.set(block.id, block);
	const target = byId.get(id);
	if (!target || target.type !== 'todo') return null;

	const childrenOf = (parentId) =>
		blocks.filter((block) => (block.parentBlockId ?? null) === parentId);

	const desired = new Map();
	const checkedOf = (block) => (desired.has(block.id) ? desired.get(block.id) : block.checked);

	// Down: the toggled value flows to every todo reachable through todos.
	const newChecked = !target.checked;
	desired.set(id, newChecked);
	function walkDown(parentId) {
		for (const child of childrenOf(parentId)) {
			if (child.type !== 'todo') continue;
			desired.set(child.id, newChecked);
			walkDown(child.id);
		}
	}
	walkDown(id);

	// Up: each todo ancestor mirrors whether all its todo children are done.
	let node = target;
	while (true) {
		const parent = byId.get(node.parentBlockId);
		if (!parent || parent.type !== 'todo') break;
		const todoKids = childrenOf(parent.id).filter((block) => block.type === 'todo');
		desired.set(parent.id, todoKids.length > 0 && todoKids.every(checkedOf));
		node = parent;
	}

	const updates = [];
	for (const [blockId, checked] of desired) {
		if (byId.get(blockId).checked !== checked) updates.push({ id: blockId, checked });
	}
	return { updates };
}
