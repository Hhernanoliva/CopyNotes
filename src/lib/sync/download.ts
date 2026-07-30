// Bringing records down (spec 030 phase 3). The mirror of `upload.ts`, and the
// half that turns an encrypted backup of one machine into "my notes everywhere".
//
// The server hands out records in the order it received them (`server_seq`, a
// Postgres sequence bumped by a trigger on every write, so it can never tie the
// way a timestamp can). This device remembers how far it has read; everything
// past that mark is new to it.
//
// Nothing here can read a note it should not: every payload is opened with the
// vault key, which lives only on this device.

import { supabase } from './supabase';
import { decryptRecord } from './records';
import { getVaultKey } from './vault';
import { uploadedThrough } from './pending';
import { recordConflict } from './conflicts';
import { db, putFromCloud } from '../storage/db';
import { getSetting, setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

const BATCH = 200;
const COLUMNS = 'table_name, id, change_seq, deleted, iv, blob, server_seq';

export async function downloadedThrough() {
	return Number(await getSetting(KEY.syncDownloadedThrough)) || 0;
}

// Forward only, like its upload twin: a late batch must not rewind the mark and
// replay half the account.
async function markDownloadedThrough(serverSeq) {
	if (serverSeq > (await downloadedThrough())) {
		await setSetting(KEY.syncDownloadedThrough, serverSeq);
	}
}

// What to do with one record that came down. The whole merge policy of phase 3
// lives here, and every branch answers the same question: could taking this
// remote version throw away something written on this device?
//
// `changeSeq` is comparable across devices because `storage/change-seq.ts`
// derives it from the clock (`max(now, last + 1)`). ponytail: a badly skewed
// clock can therefore lose a race — but never lose text, because the loser lands
// in the `conflict` branch, which touches nothing.
function decide(local, payload, uploadMark) {
	if (!local) return 'apply';
	// My own upload coming back, or a batch I already applied.
	if (local.changeSeq === payload.change_seq) return 'skip';
	// Written here and not up there yet. Both sides moved: phase 2 of this spec
	// gives it a screen; until then the local version is left untouched.
	const localIsUnsent = local.changeSeq > uploadMark && local.cloudSeq !== local.changeSeq;
	if (localIsUnsent) return 'conflict';
	// Nothing unsent here, so the newer of the two wins and no text is at risk.
	return payload.change_seq > local.changeSeq ? 'apply' : 'skip';
}

// The server column is `table_name`; the record's identity — which is bound into
// the encryption itself — is `table:id`, so it has to be renamed before the blob
// will open at all.
async function decryptPayload(key, payload) {
	const row = await decryptRecord(key, { ...payload, table: payload.table_name });
	return { ...row, changeSeq: payload.change_seq };
}

// A soft delete is an ordinary write: `deletedAt` travels inside the blob, so a
// tombstone needs no special case — it lands like any other version of the row.
async function applyPayload(key, payload) {
	await putFromCloud(payload.table_name, await decryptPayload(key, payload));
}

// One batch. Returns what happened, so the caller can decide whether to ask for
// another one and what to tell the user.
export async function downloadOnce() {
	const client = supabase();
	if (!client) return null;
	const key = await getVaultKey();
	// No vault means no way to open anything: a device that has not joined the
	// account yet (spec 030 phase 3 — the recovery-code screen).
	if (!key) return null;

	const cursor = await downloadedThrough();
	const { data, error } = await client
		.from('records')
		.select(COLUMNS)
		.gt('server_seq', cursor)
		.order('server_seq', { ascending: true })
		.limit(BATCH);
	if (error) throw new Error(error.message);
	if (!data.length) return { applied: 0, conflicts: 0, received: 0 };

	const uploadMark = await uploadedThrough();
	let applied = 0;
	let conflicts = 0;
	// Record by record, not in one transaction: an interruption leaves the mark
	// where it was, so the batch is simply read again, and applying the same
	// version twice writes the same bytes.
	for (const payload of data) {
		const local = await db.table(payload.table_name).get(payload.id);
		const action = decide(local, payload, uploadMark);
		if (action === 'apply') {
			await applyPayload(key, payload);
			applied++;
		} else if (action === 'conflict') {
			// Park the remote version instead of applying it. The local row is not
			// touched and stays pending, so nothing is lost on either side while the
			// person decides (spec 030: no conflict is ever resolved by a silent
			// last-write-wins).
			await recordConflict(payload.table_name, await decryptPayload(key, payload));
			conflicts++;
		}
	}

	await markDownloadedThrough(data[data.length - 1].server_seq);
	return { applied, conflicts, received: data.length };
}

// Keep asking until the server has nothing newer. Used both by the periodic sync
// and by the first full download of a device that just joined the account.
export async function downloadAll(options) {
	const onProgress = options?.onProgress;
	let applied = 0;
	let conflicts = 0;
	for (;;) {
		const batch = await downloadOnce();
		if (!batch || !batch.received) break;
		applied += batch.applied;
		conflicts += batch.conflicts;
		onProgress?.({ applied, conflicts });
		if (batch.received < BATCH) break;
	}
	return { applied, conflicts };
}
