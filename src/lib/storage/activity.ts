import { db } from './db';
import { createId, now } from './ids';
import { trackPendingWrite } from './pending-writes';

const activity = db.table('activity');

// Causal order via a monotonic `seq` assigned inside the append transaction.
// Two entries appended in the same millisecond used to tie on `at` and fall
// back to a random-uuid tiebreak, which could reorder them unpredictably;
// `seq` makes insertion order deterministic regardless of the wall clock.
// `at` stays on the row for display only.
function bySeqAsc(a, b) {
	return (a.seq ?? 0) - (b.seq ?? 0);
}

export function appendActivity({ blockId, noteId, actor, action, text = '' }) {
	return trackPendingWrite(() =>
		db.transaction('rw', activity, async () => {
			const rows = await activity.toArray();
			const maxSeq = rows.reduce((m, r) => (typeof r.seq === 'number' && r.seq > m ? r.seq : m), -1);
			const row = {
				id: createId(),
				blockId,
				noteId,
				actor,
				action,
				text,
				seq: maxSeq + 1,
				at: now(),
				deletedAt: null
			};
			await activity.add(row);
			return row;
		})
	);
}

export async function listActivityByBlock(blockId) {
	const rows = await activity
		.where('blockId')
		.equals(blockId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(bySeqAsc);
}

export async function listActivityByNote(noteId) {
	const rows = await activity
		.where('noteId')
		.equals(noteId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(bySeqAsc);
}

export async function listRecentActivity(limit = 50) {
	const rows = await activity.filter((row) => !row.deletedAt).toArray();
	return rows.sort((a, b) => bySeqAsc(b, a)).slice(0, limit);
}
