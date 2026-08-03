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
import { db, markSentToCloud, putFromCloud } from '../storage/db';
import { sameToTheUser } from '../storage/row-compare';
import { getSetting, setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

const BATCH = 200;
const COLUMNS = 'table_name, id, change_seq, deleted, iv, blob, server_seq';

// Cuánto se vuelve a mirar hacia atrás en cada pasada.
//
// El servidor reparte `server_seq` al EMPEZAR la escritura, no al confirmarla:
// con dos aparatos subiendo a la vez, la 101 puede quedar visible antes que la
// 100. Pidiendo sólo "lo posterior a la última que vi", esa 100 no se pedía
// nunca más — el cambio se quedaba en el otro aparato hasta que alguien
// volviera a tocar ese renglón.
//
// Releer sale gratis: una versión que ya está acá se reconoce por su número de
// cambio y no se escribe ni se descifra.
//
// ponytail: 50 es holgado para dos aparatos y tiene que ser MENOR que BATCH, o
// una tanda llena no avanzaría nunca y `downloadAll` giraría en el vacío. Un
// hueco más largo que 50 escrituras necesitaría un cursor por transacción
// abierta (`pg_snapshot`), que es otro orden de complejidad.
const OVERLAP = 50;

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
	// Esta versión de allá ya la tengo aplicada y escribí ENCIMA de ella: es la
	// base de lo que estoy por subir, no una discusión. Sin esto, releer el tramo
	// final (ver OVERLAP) inventaba un conflicto contra mi propio punto de
	// partida cada vez que pasaba por acá.
	if (local.cloudSeq === payload.change_seq) return 'skip';
	// Written here and not up there yet. Both sides moved: phase 2 of this spec
	// gives it a screen; until then the local version is left untouched.
	const localIsUnsent = local.changeSeq > uploadMark && local.cloudSeq !== local.changeSeq;
	if (localIsUnsent) return 'conflict';
	// Nothing unsent here: this device holds either exactly what it last sent or
	// exactly what it last received, so whatever the server holds NOW is that
	// version's successor and there is no text of ours to lose by taking it.
	//
	// It used to take the higher `changeSeq` instead, and that quietly threw away
	// the one decision the whole conflict machinery exists to deliver. `keepLocal`
	// is the device that edited FIRST insisting its older version wins: it uploads
	// declaring *our* version as its base, and `push_records` accepts precisely
	// because it stood on what the server held. Comparing the two clock-derived
	// numbers then re-litigated a settled question — the chosen version arrived
	// with a lower number, was read as stale, and the other device never changed.
	// The server's chain is linear and it is the authority; a device that has
	// nothing unsent does not get a vote. (A skewed clock had the same effect for
	// ordinary edits, with no way to notice.)
	return 'apply';
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
		.gt('server_seq', Math.max(0, cursor - OVERLAP))
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
		} else if (action === 'skip') {
			// Nothing to write, but something to write down: the server demonstrably
			// holds this version, and the next upload has to declare the version it
			// stands on or be refused.
			//
			// This is what rescues an upload whose reply was lost. The record landed,
			// this device never heard so, and its retry keeps claiming "this one is
			// new" — a claim the server correctly refuses, for ever. Reading the echo
			// closes the loop.
			//
			// Deliberately not done for a conflict: there the server holds the *other*
			// device's version, and recording it as this device's base would let the
			// next upload overwrite it without anyone deciding — the exact hole the
			// guard exists to close. `keepLocal` is the one place that may do it,
			// because by then a person has chosen.
			if (local.cloudSeq !== payload.change_seq) {
				await markSentToCloud(payload.table_name, payload.id, payload.change_seq);
			}
		} else if (action === 'conflict') {
			const remote = await decryptPayload(key, payload);
			if (sameToTheUser(local, remote)) {
				// Dos escrituras distintas que dejan la fila IGUAL para quien la mira.
				// Pasa cuando los dos aparatos llegan al mismo valor por su cuenta —el
				// mismo lugar para el mismo renglón, el mismo tilde en la misma tarea—:
				// para el protocolo son dos versiones en pelea, para la persona son la
				// misma cosa. Preguntar "¿cuál queda?" mostrando dos veces lo mismo no
				// es una decisión, es ruido. Se adopta la de allá: no cambia nada en
				// pantalla, cierra la discusión y deja a los dos aparatos parados sobre
				// la misma versión. No hay texto que perder — son idénticas.
				await putFromCloud(payload.table_name, remote);
				applied++;
			} else {
				// Park the remote version instead of applying it. The local row is not
				// touched and stays pending, so nothing is lost on either side while the
				// person decides (spec 030: no conflict is ever resolved by a silent
				// last-write-wins).
				await recordConflict(payload.table_name, remote);
				conflicts++;
			}
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
