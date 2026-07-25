// Short-id layer: agents read 8-char ids (cheap in tokens) and the server
// re-expands them to real UUIDs before submitting a change. Pure — the
// export payload itself is the mapping table, nothing is stored.

export const SHORT_ID_LENGTH = 8;

// Every id an agent may act on: note ids (create_task) and pending-task ids
// (complete_task / add_note / historial). Prose blocks are context only.
function actionableIds(exportPayload) {
	const ids = [];
	for (const note of exportPayload?.notes ?? []) {
		ids.push(note.id);
		for (const block of note.blocks ?? []) {
			if (block.type === 'todo') ids.push(block.id);
		}
	}
	return ids;
}

export function buildShortIds(exportPayload) {
	const ids = actionableIds(exportPayload);
	const map = new Map();
	for (const id of ids) {
		let len = SHORT_ID_LENGTH;
		let short = id.slice(0, len);
		// lengthen until the prefix is unique among ALL actionable ids
		while (ids.some((other) => other !== id && other.startsWith(short))) {
			len += 4;
			short = id.slice(0, len);
		}
		map.set(id, short);
	}
	return map;
}

export function expandId(exportPayload, shortOrFullId) {
	const matches = actionableIds(exportPayload).filter(
		(id) => id === shortOrFullId || id.startsWith(shortOrFullId)
	);
	const exact = matches.find((id) => id === shortOrFullId);
	if (exact) return { ok: true, id: exact };
	if (matches.length === 1) return { ok: true, id: matches[0] };
	return { ok: false, reason: matches.length === 0 ? 'no-encontrado' : 'ambiguo' };
}
