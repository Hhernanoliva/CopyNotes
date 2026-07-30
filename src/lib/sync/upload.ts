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
//   3. upsert them
//   4. only then advance the "uploaded through" mark
//
// A crash, a dead wifi or a closed laptop between 3 and 4 re-sends the same
// batch on the next run. That is harmless: the upsert key is
// (owner_id, table_name, id), so a re-send overwrites the identical row instead
// of duplicating it.

import { cloudConfigured, supabase } from './supabase';
import {
	countPendingUploads,
	hasUploadConsent,
	listPendingUploads,
	markUploadedThrough
} from './pending';
import { encryptRecord } from './records';
import { downloadAll } from './download';
import { countConflicts } from './conflicts';
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

function toRow(payload) {
	return {
		table_name: payload.table,
		id: payload.id,
		change_seq: payload.changeSeq,
		deleted: payload.deleted,
		iv: payload.iv,
		blob: payload.blob
	};
}

// One batch. Returns how many records landed, so the caller knows whether to ask
// for another one.
async function uploadBatch(client, key) {
	const pending = await listPendingUploads({ limit: BATCH });
	if (!pending.length) return 0;

	const rows = await Promise.all(
		pending.map(async ({ table, row }) => toRow(await encryptRecord(key, table, row)))
	);
	const { error } = await client
		.from('records')
		.upsert(rows, { onConflict: 'owner_id,table_name,id' });
	if (error) throw new Error(error.message);

	// The batch is ordered oldest change first, so the last one is the highest:
	// everything up to here is now on the server.
	await markUploadedThrough(pending[pending.length - 1].row.changeSeq);
	return rows.length;
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
				const count = await uploadBatch(gate.client, gate.key);
				uploaded += count;
				if (count < BATCH) break;
			}
			if (uploaded) syncStatus.lastUploadAt = now();
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
