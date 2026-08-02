// The upload loop (spec 030 phase 2): what leaves the device, and when.
//
// Nothing here decides what may leave — `pending.ts` does, and it answers with an
// empty list until the user consents. Nothing here can read a note either: every
// record goes through `encryptRecord` first, so this file only ever handles
// blobs it cannot open.
//
// The order matters and is the whole durability story:
//
//   1. list the oldest pending changes
//   2. encrypt them
//   3. hand them to `push_records`, declaring the version each one stands on
//   4. only then write down what the server took
//
// A crash, a dead wifi or a closed laptop between 3 and 4 re-sends the same
// batch on the next run. Nothing is duplicated — the key is
// (owner_id, table_name, id) — but the re-send is *refused*, because this device
// still claims those records are new and the server can see they are not. That
// is on purpose, and it is the same refusal that stops one device from
// overwriting an edit the other made: only a write that stands on the version
// the server actually holds may land. The refusal is undone by the download
// right after, which recognises the record as this device's own echo and writes
// down that the server has it (see `download.ts`).

import { cloudConfigured, supabase } from './supabase';
import {
	countPendingUploads,
	hasUploadConsent,
	listPendingUploads,
	markUploadedThrough
} from './pending';
import { encryptRecord } from './records';
import { markSentToCloud } from '../storage/db';
import { downloadAll } from './download';
import { countConflicts } from './conflicts';
import { nudgePeers } from './live';
import { getRecoveryBlob, getVaultKey } from './vault';
import { syncStatus } from './status.svelte';
import { now } from '../storage/ids';

const BATCH = 200;
// ponytail: a hard stop so a bug upstream can never turn one sync into an
// endless upload; 50 batches is 10.000 records, far past any real backlog.
const MAX_BATCHES = 50;
const INTERVAL_MS = 30_000;

// Set once per app run: the wrapped key is a single small row that only changes
// when the vault is created, so re-sending it every 30 seconds would be noise.
let vaultBlobSent = false;

// All four gates in one place. Any of them missing means "not now", not an
// error: no cloud configured, not logged in, no consent yet, no vault yet.
async function ready() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	if (!data.session) return null;
	if (!(await hasUploadConsent())) return null;
	const key = await getVaultKey();
	if (!key) return null;
	return { client, key };
}

// `base_seq` is the whole guard: the version this device believes the server
// holds. Null means "I have never seen this record up there", which the server
// only accepts as an insert. Anything else must match, or the write is refused.
function toRow(payload, baseSeq) {
	return {
		table_name: payload.table,
		id: payload.id,
		change_seq: payload.changeSeq,
		base_seq: baseSeq ?? null,
		deleted: payload.deleted,
		iv: payload.iv,
		blob: payload.blob
	};
}

// One batch. Returns how many records were sent and how many the server took, so
// the caller knows whether to ask for another one.
async function uploadBatch(client, key) {
	const pending = await listPendingUploads({ limit: BATCH });
	if (!pending.length) return { sent: 0, accepted: 0 };

	const rows = await Promise.all(
		pending.map(async ({ table, row }) =>
			toRow(await encryptRecord(key, table, row), row.cloudSeq)
		)
	);
	// Never a bare upsert: `push_records` is the only writer that can say no.
	const { data, error } = await client.rpc('push_records', { payload: rows });
	if (error) throw new Error(error.message);

	const refused = new Set(
		(data ?? []).map((row) => `${row.rejected_table}:${row.rejected_id}`)
	);
	// Confirm what landed one record at a time, so a refusal in the middle of the
	// batch costs nothing to the records around it.
	let lowestRefused = Infinity;
	for (const { table, row } of pending) {
		if (refused.has(`${table}:${row.id}`)) {
			lowestRefused = Math.min(lowestRefused, row.changeSeq);
			continue;
		}
		await markSentToCloud(table, row.id, row.changeSeq);
	}

	// The batch is ordered oldest change first, so the last one is the highest.
	// A refusal pulls the mark back below it: the record has to stay findable as
	// pending, or the edit would be stranded on this device for ever. The ones
	// that landed are excluded by their `cloudSeq` instead, not by this mark.
	await markUploadedThrough(
		lowestRefused === Infinity ? pending[pending.length - 1].row.changeSeq : lowestRefused - 1
	);
	return { sent: rows.length, accepted: rows.length - refused.size };
}

// The wrapped copy of the vault key — what a second device needs together with
// the recovery code. Useless to anyone without that code.
async function uploadVaultBlob(client) {
	if (vaultBlobSent) return;
	const blob = await getRecoveryBlob();
	if (!blob) return;
	const { error } = await client.from('vaults').upsert(blob, { onConflict: 'owner_id' });
	if (error) throw new Error(error.message);
	vaultBlobSent = true;
}

// Does this account already have a vault, created on another device?
//
// A second device must never create its own: the key would be a different one,
// and from then on each device would upload records the other cannot open, with
// `vaults` holding whichever wrapped key arrived last. Joining an existing vault
// with the recovery code is phase 3 (`restoreVault` is built and tested, it has
// nothing to restore from until download exists), so until then the honest move
// is to refuse early and say why.
export async function cloudVaultExists() {
	return Boolean(await cloudVaultBlob());
}

// The wrapped key this account's other device left behind. Useless without the
// recovery code, which is what the joining screen asks for.
export async function cloudVaultBlob() {
	const client = supabase();
	if (!client) return null;
	const { data, error } = await client
		.from('vaults')
		.select('salt, iv, wrapped')
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

// The one entry point. Safe to call from a timer, a button, or the "connection
// came back" event: overlapping calls collapse into the one already running.
export async function syncNow() {
	if (syncStatus.uploading) return;
	syncStatus.uploading = true;
	syncStatus.error = null;
	try {
		const gate = await ready();
		if (gate) {
			await uploadVaultBlob(gate.client);
			let uploaded = 0;
			for (let batch = 0; batch < MAX_BATCHES; batch++) {
				const { sent, accepted } = await uploadBatch(gate.client, gate.key);
				uploaded += accepted;
				// Stop on the first refusal too, not only on a short batch: a refused
				// record stays pending, so asking for another batch would hand back the
				// same rows and spin. The download right below is what unblocks it, by
				// turning the disagreement into a decision.
				if (sent < BATCH || accepted < sent) break;
			}
			if (uploaded) {
				syncStatus.lastUploadAt = now();
				// One message per batch, and only when somebody is listening.
				nudgePeers();
			}
		}
		// Downloading needs no upload consent: joining the account with the recovery
		// code is the request, and a device that never consented has nothing of its
		// own up there anyway. Upload first, so my own records come back as an echo
		// the merge already knows to ignore.
		const down = await downloadAll({});
		if (down.applied) syncStatus.appliedVersion++;
	} catch (error) {
		// Never rethrown: a failed upload is a status line, not a broken app. The
		// next run retries the same batch.
		syncStatus.error = error instanceof Error ? error.message : 'No se pudo sincronizar.';
	} finally {
		syncStatus.uploading = false;
		syncStatus.pending = await countPendingUploads();
		// The whole standing pile, not what this run happened to find: a conflict
		// stays open until the person decides it.
		syncStatus.conflicts = await countConflicts();
	}
}

// Started once, from the root layout. Every gate lives inside `syncNow`, so this
// is harmless when there is no cloud, no session or no consent.
export function startUploadClock() {
	// A build with no Supabase project never ticks at all: no timer, no database
	// read every 30 seconds for an answer that cannot change.
	if (typeof window === 'undefined' || !cloudConfigured()) return () => {};
	// The first run is DEFERRED, never synchronous. `syncNow` reads and writes
	// `syncStatus`, so calling it inside the caller's `$effect` body would
	// register that read as a dependency of the effect and the write would
	// re-trigger it — an infinite loop that freezes the tab. It also has no
	// business competing with the first paint.
	const first = setTimeout(syncNow, 1000);
	const timer = setInterval(syncNow, INTERVAL_MS);
	// Coming back online is the moment a backlog exists; do not make the user
	// wait out the interval for it.
	window.addEventListener('online', syncNow);
	return () => {
		clearTimeout(first);
		clearInterval(timer);
		window.removeEventListener('online', syncNow);
	};
}
