// Short-id layer: agents read 8-char ids (cheap in tokens) and the server
// re-expands them to real UUIDs before submitting a change. Pure — the
// export payload itself is the mapping table, nothing is stored.

export const SHORT_ID_LENGTH = 8;

// Note ids (create_task targets these) and pending-task ids (complete_task /
// add_note / historial target these). Prose blocks are context only. Kept
// separate so a short id resolves within its OWN kind: a note prefix must
// never expand to a task UUID or vice versa.
function noteIds(exportPayload) {
	return (exportPayload?.notes ?? []).map((note) => note.id);
}

function taskIds(exportPayload) {
	const ids = [];
	for (const note of exportPayload?.notes ?? []) {
		for (const block of note.blocks ?? []) {
			if (block.type === 'todo') ids.push(block.id);
		}
	}
	return ids;
}

// The full pool: short ids must be unique across BOTH kinds so the agent never
// sees the same short string standing for a note and a task.
function actionableIds(exportPayload) {
	return [...noteIds(exportPayload), ...taskIds(exportPayload)];
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

// Resolve a short-or-full id WITHIN its kind ('note' or 'task'). An empty
// string matches nothing (a bare startsWith('') would match every id).
export function expandId(exportPayload, shortOrFullId, kind) {
	if (!shortOrFullId) return { ok: false, reason: 'no-encontrado' };
	const pool = kind === 'note' ? noteIds(exportPayload) : taskIds(exportPayload);
	const matches = pool.filter((id) => id === shortOrFullId || id.startsWith(shortOrFullId));
	const exact = matches.find((id) => id === shortOrFullId);
	if (exact) return { ok: true, id: exact };
	if (matches.length === 1) return { ok: true, id: matches[0] };
	return { ok: false, reason: matches.length === 0 ? 'no-encontrado' : 'ambiguo' };
}
