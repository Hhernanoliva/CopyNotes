import { db } from './db';
import { createId, now } from './ids';
import { trackPendingWrite } from './pending-writes';

const activity = db.table('activity');

// Chronological order. `at` is an ISO timestamp; when two entries land in the
// same millisecond we fall back to the (stable) id so the order is
// deterministic even if not strictly chronological.
function byAtAsc(a, b) {
	if (a.at !== b.at) {
		return a.at.localeCompare(b.at);
	}
	return a.id.localeCompare(b.id);
}

export function appendActivity({ blockId, noteId, actor, action, text = '' }) {
	return trackPendingWrite(async () => {
		const row = {
			id: createId(),
			blockId,
			noteId,
			actor,
			action,
			text,
			at: now(),
			deletedAt: null
		};
		await activity.add(row);
		return row;
	});
}

export async function listActivityByBlock(blockId) {
	const rows = await activity
		.where('blockId')
		.equals(blockId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(byAtAsc);
}

export async function listActivityByNote(noteId) {
	const rows = await activity
		.where('noteId')
		.equals(noteId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(byAtAsc);
}

export async function listRecentActivity(limit = 50) {
	const rows = await activity.filter((row) => !row.deletedAt).toArray();
	return rows.sort((a, b) => byAtAsc(b, a)).slice(0, limit);
}
