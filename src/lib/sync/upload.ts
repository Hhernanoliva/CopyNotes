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
	countAllPending,
	hasUploadConsent,
	listPendingUploads,
	markUploadedThrough
} from './pending';
import { encryptRecord } from './records';
import { markSentToCloud } from '../storage/db';
import { downloadAll } from './download';
import { sharedReady, syncShared } from './shared';
import { countConflicts } from './conflicts';
import { nudgePeers } from './live';
import { getVaultKey, makeVaultProof, proofOpens } from './vault';
import { ensureAccountMatches } from './leave';
import { syncStatus, userFacing, reportSyncFailure } from './status.svelte';
import { now } from '../storage/ids';

const BATCH = 200;
// ponytail: a hard stop so a bug upstream can never turn one sync into an
// endless upload; 50 batches is 10.000 records, far past any real backlog.
const MAX_BATCHES = 50;
const INTERVAL_MS = 30_000;

// Set once per app run: the vault row is a single small row that only changes
// when the vault is created, so re-sending it every 30 seconds would be noise.
let vaultBlobSent = false;

// Leaving the account resets it: the next account has a different vault, and a
// flag left true would keep this device from ever announcing the new one — so
// the second device would never find one and would build a rival.
export function forgetSentVaultBlob() {
	vaultBlobSent = false;
}

// Quién está firmado ahora mismo, o null si no hay nube o no hay sesión.
async function currentAccount() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	return data.session?.user?.id ?? null;
}

// All four gates in one place. Any of them missing means "not now", not an
// error: no cloud configured, not logged in, no consent yet, no vault yet.
export async function ready() {
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

// Lo que este aparato deja arriba: la marca de que la cuenta tiene bóveda, y la
// prueba de cuál (spec 035). La llave NO sube — lo que sube es un texto conocido
// cifrado con ella, que no le sirve a nadie y que sólo abre quien la tiene.
//
// `insert`, nunca `upsert`. Dos aparatos pueden comprobar a la vez que la cuenta
// no tiene bóveda y crear cada uno la suya, con llaves distintas; con `upsert`
// ganaba la última y desde ese momento cada uno subía registros que el otro no
// podía abrir. Ahora la PRIMERA bóveda gana: la segunda choca contra la clave
// primaria (el candado tampoco deja pisarla, ver supabase/schema.sql).
async function uploadVaultBlob(client) {
	if (vaultBlobSent) return;
	if (!(await getVaultKey())) return;
	const proof = await makeVaultProof();
	const { error } = await client.from('vaults').insert(proof);
	// 23505 = unique_violation en Postgres. Y significa dos cosas opuestas, porque
	// el servidor contesta igual en las dos: la fila que ya está arriba puede ser
	// de OTRO aparato —el caso de abajo, que hay que frenar— o de ESTE MISMO, de
	// la vez anterior que se abrió la app.
	//
	// `vaultBlobSent` sólo vive lo que vive la ventana, así que cada arranque
	// reintenta el insert. Sin mirar cuál de las dos filas es, un aparato sano se
	// acusaba a sí mismo de haber llegado segundo y frenaba la subida entera: a
	// partir de la segunda vez que se abría la app no subía nada nunca más
	// (commit a4c6e0d).
	//
	// Se distinguen abriendo la prueba: si esta llave la abre, la bóveda de la
	// cuenta es la de este aparato. Para eso existe la prueba y para nada más.
	if (error?.code === '23505') {
		if (await proofOpens(await cloudVaultProof())) {
			vaultBlobSent = true;
			return;
		}
		throw userFacing(
			'Esta cuenta ya tiene una bóveda creada en otro aparato. Sumá este aparato con el código que muestra el otro.'
		);
	}
	if (error) throw new Error(error.message);
	vaultBlobSent = true;
}

// Does this account already have a vault, created on another device?
//
// A second device must never create its own: the key would be a different one,
// and from then on each device would upload records the other cannot open. The
// way in for a device without a key is asking the other one for a pairing code
// (`sync/pairing.ts`), so this answer is what sends it to that screen.
export async function cloudVaultExists() {
	return Boolean(await cloudVaultProof());
}

// La prueba que dejó el aparato que creó la bóveda de esta cuenta, o null. No
// abre nada: sólo deja que un aparato compruebe si la llave que tiene es la de
// esta cuenta.
export async function cloudVaultProof() {
	const client = supabase();
	if (!client) return null;
	const { data, error } = await client.from('vaults').select('iv, check_blob').maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

// The one entry point. Safe to call from a timer, a button, or the "connection
// came back" event: overlapping calls collapse into the one already running.
//
// Cómo se cuenta una falla vive en `status.svelte.ts`: el caño compartido la
// necesita igual, y una nota a la vez (ver `shared.ts`).
export async function syncNow() {
	if (syncStatus.uploading) return;
	syncStatus.uploading = true;
	syncStatus.error = null;
	syncStatus.errorDetail = null;
	syncStatus.offline = false;
	try {
		// Antes que nada, y antes de la bajada también: si la sesión que hay ahora
		// es de OTRA cuenta que la que dejó acá la llave y los cursores, no hay
		// nada que sincronizar hasta limpiar. Este tic no hace nada; el próximo se
		// encuentra sin permiso ni bóveda y espera a que la persona conecte el
		// aparato de nuevo.
		const account = await currentAccount();
		if (account && !(await ensureAccountMatches(account))) return;

		// Spec 038, y el orden importa: esto va ANTES de la subida cifrada.
		//
		// `list_shares()` es lo único que le devuelve a este aparato la marca de
		// qué notas están compartidas, y esa marca falta sola en tres casos —
		// después de restaurar un respaldo, en un aparato nuevo, y después de
		// cerrar sesión. En cualquiera de los tres, la nota entera figura como
		// pendiente sin que nadie la haya editado, así que si `uploadBatch`
		// corriera primero la subiría al caño cifrado y la nota quedaría en los
		// dos. El comentario de más abajo ("subir primero, así lo mío vuelve como
		// eco") sigue siendo cierto y es sobre el caño cifrado: esto es un paso
		// ANTES, no un cambio de ese orden.
		//
		// Fuera del `if (gate)` a propósito: sus puertas no son estas (ver
		// `sync/shared.ts`). Un invitado sin permiso de subir y sin bóveda tiene
		// que sincronizar su ticket igual.
		const sharedClient = await sharedReady();
		// La campanita que despierta a la pantalla la toca `syncShared` adentro:
		// estaba acá, y el segundo llamador que apareció —`InviteAccept`— se la
		// olvidó, con lo cual aceptar una invitación traía la nota a la base y no
		// la mostraba hasta recargar (gate manual, 2026-08-17).
		if (sharedClient) await syncShared(sharedClient);

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
		reportSyncFailure(error);
	} finally {
		syncStatus.uploading = false;
		// Las dos colas sumadas, y por una sola puerta: escrita a mano acá y en
		// `SettingsDialog`, el segundo se quedó con la mitad y abrir Configuración
		// bajaba el número a cero. Por qué son dos y no una está en
		// `countAllPending`. Esta línea es el ÚNICO testigo del gate manual de dos
		// aparatos, así que no puede mentir.
		syncStatus.pending = await countAllPending();
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
