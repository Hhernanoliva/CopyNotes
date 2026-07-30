// What still has to go up, and the gate that decides whether anything may go up
// at all (spec 030 phase 2).
//
// There is no outbox table. Phase 1's indexed change counter already answers
// "what is not uploaded yet": every write raises `changeSeq`, so a record whose
// counter is above the last uploaded mark is pending — including tombstones (a
// soft delete is a write like any other) and including everything typed while
// offline. That costs no extra write per keystroke and no second table to keep
// consistent.
//
// Consent is structural, not a reminder: nothing can be listed for upload until
// the user grants it, so an uploader physically cannot find data to send. That
// is the "nothing leaves the device without explicit consent" rule of spec 030,
// enforced at the only door that hands records out.

import { db, SYNCED_TABLES } from '../storage/db';
import { getSetting, setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

export async function hasUploadConsent() {
	return (await getSetting(KEY.syncConsent)) === true;
}

export function grantUploadConsent() {
	return setSetting(KEY.syncConsent, true);
}

export async function uploadedThrough() {
	return Number(await getSetting(KEY.syncUploadedThrough)) || 0;
}

// Only ever forward: a late-arriving batch confirmation must not rewind the
// mark and re-upload half the database.
export async function markUploadedThrough(seq) {
	if (seq > (await uploadedThrough())) await setSetting(KEY.syncUploadedThrough, seq);
}

// How much is waiting, without loading a single record — Configuración shows
// this number, and it is the honest answer to "is everything up there?". Behind
// the same consent gate as the door below: before consent there is nothing
// pending, because nothing may go up.
export async function countPendingUploads() {
	if (!(await hasUploadConsent())) return 0;
	const mark = await uploadedThrough();
	const counts = await Promise.all(
		SYNCED_TABLES.map((table) => db.table(table).where('changeSeq').above(mark).count())
	);
	return counts.reduce((total, count) => total + count, 0);
}

// Oldest change first, so an interrupted upload can be resumed by advancing the
// mark: everything before it is known to have landed.
export async function listPendingUploads({ limit = 200 } = {}) {
	if (!(await hasUploadConsent())) return [];
	const mark = await uploadedThrough();
	const batches = await Promise.all(
		SYNCED_TABLES.map(async (table) => {
			const rows = await db.table(table).where('changeSeq').above(mark).limit(limit).toArray();
			return rows.map((row) => ({ table, row }));
		})
	);
	return batches
		.flat()
		.sort((a, b) => a.row.changeSeq - b.row.changeSeq)
		.slice(0, limit);
}
