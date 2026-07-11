// Snapshot-based undo/redo for one note (spec 019, fix 6). Pure: the caller
// snapshots via $state.snapshot before mutating, and persists diffs on restore.
// Chosen over an operation log for the MVP; the module boundary keeps it
// swappable for sync/MCP later (see spec 019 for the Workflowy comparison).

export function createHistory({ limit = 100 } = {}) {
	let undoStack = [];
	let redoStack = [];
	return {
		push(snapshot) {
			undoStack.push(snapshot);
			if (undoStack.length > limit) undoStack.shift();
			redoStack = [];
		},
		undo(current) {
			if (undoStack.length === 0) return null;
			redoStack.push(current);
			return undoStack.pop();
		},
		redo(current) {
			if (redoStack.length === 0) return null;
			undoStack.push(current);
			return redoStack.pop();
		},
		canUndo: () => undoStack.length > 0,
		canRedo: () => redoStack.length > 0,
		reset() {
			undoStack = [];
			redoStack = [];
		}
	};
}

// Compare two block arrays by id so a restore can be persisted through storage.
// prev = the state now, next = the snapshot we are restoring to.
export function diffBlocks(prev, next) {
	const prevById = new Map(prev.map((b) => [b.id, b]));
	const nextById = new Map(next.map((b) => [b.id, b]));
	const created = next.filter((b) => !prevById.has(b.id));
	const deletedIds = prev.filter((b) => !nextById.has(b.id)).map((b) => b.id);
	const updated = next.filter((b) => {
		const before = prevById.get(b.id);
		return before && JSON.stringify(before) !== JSON.stringify(b);
	});
	return { created, updated, deletedIds };
}
