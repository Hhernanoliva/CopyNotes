import { db } from './db';
import { createId, now } from './ids';
import { nextChangeSeq } from './change-seq';
import { trackPendingWrite } from './pending-writes';

const activity = db.table('activity');

// Causal order via a monotonic `seq`. Two entries appended in the same
// millisecond used to tie on `at` and fall back to a random-uuid tiebreak,
// which could reorder them unpredictably; `seq` makes insertion order
// deterministic regardless of the wall clock. `at` stays on the row for display
// only. `seq` is NOT the sync counter: a restore keeps it, so the bitácora reads
// in its original order even though the sync stamp is rewritten.
// El desempate por `id` es de spec 038: `seq` venía de UN contador monótono y no
// podía empatar, pero dos cuentas son dos contadores leyendo el mismo reloj. El
// `id` no significa nada y esa es la gracia — es estable, así que los dos
// aparatos leen el mismo orden y una lista invertida es exactamente la inversa.
function bySeqAsc(a, b) {
	return (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id));
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
			// The shared monotonic counter (spec 030 phase 1) instead of a max over
			// the table: that read grew with the bitácora, on every single append.
			// Both are monotonic, so the order is the same, and old rows keep their
			// small numbers — appended earlier, sorted earlier.
			seq: nextChangeSeq(),
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
