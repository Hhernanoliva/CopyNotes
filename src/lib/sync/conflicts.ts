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

export function recordConflict(table, row) {
	return conflicts().put({
		id: conflictId(table, row.id),
		table,
		recordId: row.id,
		remote: row,
		at: now()
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
	if (!conflict) return false;
	await markSentToCloud(conflict.table, conflict.recordId, conflict.remote.changeSeq);
	await conflicts().delete(id);
	return true;
}

// Take the version from the other device. It goes in through the same door every
// downloaded record uses, so it does not come back up as a brand-new local
// change — the local edit is what the person chose to discard.
export async function takeRemote(id) {
	const conflict = await conflicts().get(id);
	if (!conflict) return false;
	await putFromCloud(conflict.table, conflict.remote);
	await conflicts().delete(id);
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
