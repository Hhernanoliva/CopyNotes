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
import { sharedNoteIds } from '../storage/shares';
import { countSharedPending } from './shared';

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
// A record that came down from the cloud and was not touched since carries
// `cloudSeq === changeSeq`: the server already has that exact version, so
// sending it back is pure ping-pong. Any local edit re-stamps `changeSeq` and
// the two stop matching, which is what makes it pending again.
const changedSinceCloud = (row) => row.cloudSeq !== row.changeSeq;

// Las tres tablas cuyas filas viajan por el caño compartido (spec 038).
// `tagAssignments` NO está y no es un olvido: son la organización privada del
// dueño, no viajan por el caño compartido (spec 038 §3), y si dejaran de viajar
// por el cifrado el segundo aparato del dueño perdería las etiquetas de cada
// nota que comparta.
const SHARED_TABLES = new Set(['notes', 'blocks', 'activity']);

// El hermano del permiso de arriba, y no su espejo: el permiso es un sí/no y
// esto es una búsqueda. NO puede ser un `.filter()`: ese callback es síncrono y
// no puede preguntarle nada a la base. El conjunto se lee UNA vez por llamada,
// antes de recorrer los índices.
function skipsSharedRows(shared) {
	return (table, row) => {
		if (!SHARED_TABLES.has(table)) return false;
		return shared.has(table === 'notes' ? row.id : row.noteId);
	};
}

export async function countPendingUploads() {
	if (!(await hasUploadConsent())) return 0;
	const mark = await uploadedThrough();
	const skip = skipsSharedRows(await sharedNoteIds());
	const counts = await Promise.all(
		SYNCED_TABLES.map((table) =>
			db
				.table(table)
				.where('changeSeq')
				.above(mark)
				.filter((row) => changedSinceCloud(row) && !skip(table, row))
				.count()
		)
	);
	return counts.reduce((total, count) => total + count, 0);
}

// El número que ve la persona: son DOS colas y hay que sumarlas.
//
// La de arriba arranca en cero sin permiso de subir, y un invitado nunca lo da
// —no tiene bóveda ni notas propias en la nube—, así que lo único que él puede
// tener pendiente es lo del caño compartido. La suma vivía escrita por separado
// en `upload.ts` y en `SettingsDialog`, y el segundo se había quedado con la
// mitad: abrir Configuración bajaba el número a cero hasta la pasada siguiente.
// Una sola puerta, y no hay una mitad que se pueda olvidar (gate manual,
// 2026-08-17).
export async function countAllPending() {
	return (await countPendingUploads()) + (await countSharedPending());
}

// Oldest change first, so an interrupted upload can be resumed by advancing the
// mark: everything before it is known to have landed.
export async function listPendingUploads({ limit = 200 } = {}) {
	if (!(await hasUploadConsent())) return [];
	const mark = await uploadedThrough();
	// Adentro del mismo `.filter()` y ANTES del `.limit()`: si se filtrara
	// después, una tanda podría volver corta de filas que sí tenía que llevar.
	const skip = skipsSharedRows(await sharedNoteIds());
	const batches = await Promise.all(
		SYNCED_TABLES.map(async (table) => {
			const rows = await db
				.table(table)
				.where('changeSeq')
				.above(mark)
				.filter((row) => changedSinceCloud(row) && !skip(table, row))
				.limit(limit)
				.toArray();
			return rows.map((row) => ({ table, row }));
		})
	);
	return batches
		.flat()
		.sort((a, b) => a.row.changeSeq - b.row.changeSeq)
		.slice(0, limit);
}
