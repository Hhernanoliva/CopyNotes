// Mover una nota de un caño al otro (spec 038 §2).
//
// EL ORDEN ES LA HISTORIA ENTERA, y está elegido por cómo falla cada mitad:
// borrar del caño viejo va ÚLTIMO. Una nota que queda un rato en los dos es un
// duplicado, que se ve y se arregla; una nota que no queda en ninguno es una
// nota que dejó de sincronizar, y eso no se ve nunca.
//
// Y reiniciar `cloudSeq` NO alcanza, en ninguna de las dos direcciones.
// `pending.ts` llega a una fila por `.where('changeSeq').above(marca)` —la marca
// global de "subido hasta acá"— ANTES de mirar `cloudSeq`. Una nota que vuelve
// al caño cifrado trae sellos viejos que quedaron por debajo de esa marca, así
// que el índice no la devuelve nunca y la nota deja de sincronizar en silencio:
// justo la falla que esta sección existe para evitar, entrando por la puerta de
// arriba de la que estaba vigilando. Por eso la mudanza RESELLA `changeSeq` en
// cada fila afectada, que además es honesto: el caño de destino nunca vio esa
// fila.

import { db } from '../storage/db';
import { setShareRole } from '../storage/shares';
import { pushSharedNote } from './shared';

async function noteRows(noteId) {
	const note = await db.table('notes').get(noteId);
	const rows = note ? [{ table: 'notes', row: note }] : [];
	for (const table of ['blocks', 'activity']) {
		for (const row of await db.table(table).where('noteId').equals(noteId).toArray()) {
			rows.push({ table, row });
		}
	}
	return rows;
}

// Sello nuevo y base en cero, en una sola escritura por fila. `fromCloud` NO va
// acá a propósito: queremos que el sello suba, es lo que pone la fila en la cola
// del caño de destino — y el sello lo pone el gancho `updating` de `db.ts`, que
// es justamente lo que hace cuando la escritura NO viene de la nube. Poner un
// `changeSeq` a mano acá sería escribir un número que el gancho pisa igual.
async function restampForNewPipe(rows) {
	for (const { table, row } of rows) {
		await db.table(table).update(row.id, { cloudSeq: undefined });
	}
}

export async function shareNote(client, noteId) {
	const { error } = await client.rpc('open_share', { p_note_id: noteId });
	if (error) throw new Error(error.message);

	const rows = await noteRows(noteId);
	await setShareRole(noteId, 'owner');
	await restampForNewPipe(rows);
	await pushSharedNote(client, noteId, 'owner');

	// Último. Y con la lista puesta por el cliente, porque el servidor no puede
	// saber qué filas de `records` son de esta nota: son bultos cerrados con el
	// `noteId` adentro del sobre.
	const { error: deleteError } = await client.rpc('delete_records', {
		payload: rows.map(({ table, row }) => ({ table_name: table, id: row.id }))
	});
	if (deleteError) throw new Error(deleteError.message);
}

export async function unshareNote(client, noteId) {
	const rows = await noteRows(noteId);
	await setShareRole(noteId, null);
	await restampForNewPipe(rows);
	// El servidor último otra vez, por el mismo motivo: la cascada de `shares` se
	// lleva filas, miembros e invitaciones de una.
	const { error } = await client.rpc('close_share', { p_note_id: noteId });
	if (error) throw new Error(error.message);
}
