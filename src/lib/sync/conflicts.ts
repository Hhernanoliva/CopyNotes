// "Lo edité en los dos lados" (spec 030 phase 3).
//
// The rule the whole spec is built on: no conflict is ever resolved by a silent
// last-write-wins. When a record comes down and this device has its own unsent
// version of it, the download leaves the local row alone and parks the remote
// version here. Nothing is lost, and the choice belongs to the person.
//
// The parked copy is a plain decrypted row, like every other local row (decision
// D1: local storage stays plaintext). It lives outside `SYNCED_TABLES` and
// outside the backup's table list — a decision pending on this machine means
// nothing on another one.

import { db, markSentToCloud, putFromCloud } from '../storage/db';
import { now } from '../storage/ids';

const conflicts = () => db.table('conflicts');

// One row can only be in conflict with one remote version: the newest. A second
// arrival overwrites the first, so the id is deterministic rather than random.
const conflictId = (table, recordId) => `${table}:${recordId}`;

export async function recordConflict(table, row) {
	const id = conflictId(table, row.id);
	// La bajada relee un tramo del final en cada pasada (`download.ts`), así que
	// un conflicto que todavía espera decisión vuelve a pasar por acá cada 30
	// segundos. Guardar la hora de nuevo lo mandaría al tope de la lista una y
	// otra vez, como si acabara de aparecer.
	const parked = await conflicts().get(id);
	const sameVersion = parked?.remote?.changeSeq === row.changeSeq;
	return conflicts().put({
		id,
		table,
		recordId: row.id,
		remote: row,
		at: sameVersion ? parked.at : now()
	});
}

export function listConflicts() {
	return conflicts().orderBy('at').reverse().toArray();
}

// Los conflictos de un conjunto de renglones, listos para mostrarlos EN el
// renglón. Es donde la persona los va a entender: un aviso en Configuración
// sobre "un registro" no le dice cuál de sus líneas está en discusión.
export async function conflictsByBlock(blockIds) {
	if (!blockIds.length) return {};
	const rows = await conflicts().where('table').equals('blocks').toArray();
	const wanted = new Set(blockIds);
	const found = {};
	for (const row of rows) {
		if (wanted.has(row.recordId)) found[row.recordId] = row;
	}
	return found;
}

export function countConflicts() {
	return conflicts().count();
}

// En qué notas hay algo esperando una decisión. La lista de notas las marca con
// eso: el número del header dice CUÁNTAS hay, y esto dice DÓNDE — sin abrirlas
// una por una. Un renglón borrado acá ya no está en `blocks`, así que la nota
// sale de la versión que llegó de allá.
export async function noteIdsWithConflicts() {
	const rows = await conflicts().where('table').equals('blocks').toArray();
	const found = new Set();
	for (const row of rows) {
		const local = await db.table('blocks').get(row.recordId);
		const noteId = local?.noteId ?? row.remote?.noteId ?? null;
		if (noteId) found.add(noteId);
	}
	return found;
}

// Keep what is on this device: the local row is already the one in the database
// and is still pending, so the next sync pushes it up and the other device gets
// it.
//
// The one thing that has to change is the version the row stands on. The server
// refuses a write whose declared base is not what it holds, and what it holds is
// exactly the version parked here — so without this the upload would be refused
// for ever and the decision would silently never travel.
export async function keepLocal(id) {
	const conflict = await conflicts().get(id);
	if (!conflict) return null;
	const undo = await snapshot(conflict);
	await markSentToCloud(conflict.table, conflict.recordId, conflict.remote.changeSeq);
	await conflicts().delete(id);
	return undo;
}

// Take the version from the other device. It goes in through the same door every
// downloaded record uses, so it does not come back up as a brand-new local
// change — the local edit is what the person chose to discard.
export async function takeRemote(id) {
	const conflict = await conflicts().get(id);
	if (!conflict) return null;
	const undo = await snapshot(conflict);
	await putFromCloud(conflict.table, conflict.remote);
	await conflicts().delete(id);
	return undo;
}

// Everything a decision destroys, kept so one tap can put it back. Deciding is a
// single tap now, so the way out has to be one too — and the row it restores has
// to be the *whole* row, `cloudSeq` included: that field is what the next upload
// declares as the version it stands on, and a wrong one is refused for ever.
async function snapshot(conflict) {
	return { conflict, row: await db.table(conflict.table).get(conflict.recordId) };
}

// `fromCloud` rides along for the same reason it does everywhere else: putting a
// row back the way it was is not a new edit, so the change counter must not move
// — otherwise undoing would itself become something to upload.
export async function undoDecision(undo) {
	if (!undo?.conflict) return false;
	if (undo.row) await db.table(undo.conflict.table).put({ ...undo.row, fromCloud: true });
	await conflicts().put(undo.conflict);
	return true;
}

// What a person can recognise: the words they wrote. Never the private comment
// of a block — it is not shown anywhere else either.
export function describeRecord(table, row) {
	if (!row) return '';
	if (table === 'blocks') return row.content ?? '';
	if (table === 'notes' || table === 'folders' || table === 'tags' || table === 'snippets') {
		return row.title ?? row.name ?? '';
	}
	if (table === 'activity') return row.text ?? '';
	return '';
}

const TABLE_LABEL = {
	notes: 'Nota',
	blocks: 'Renglón',
	snippets: 'Snippet',
	tags: 'Etiqueta',
	tagAssignments: 'Etiqueta puesta',
	folders: 'Carpeta',
	activity: 'Bitácora'
};

export function describeTable(table) {
	return TABLE_LABEL[table] ?? table;
}

// A deletion has no text to show, so it needs saying out loud.
export function isDeletion(row) {
	return Boolean(row?.deletedAt);
}
