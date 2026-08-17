// El caño compartido (spec 038). El gemelo de `upload.ts` + `download.ts` para
// las notas que salieron de la bóveda.
//
// SUS PUERTAS NO SON LAS DEL OTRO CAÑO, y esto es lo primero que hay que
// entender del archivo. `syncNow` corre detrás de cuatro (nube configurada,
// sesión, permiso de subir, llave de la bóveda), y las dos últimas existen
// porque `records` va cifrado con una llave que este aparato puede no tener. Una
// nota compartida viaja en claro y no necesita ninguna de las dos: un invitado
// que nunca consintió subir sus propias notas, y que nunca creó una bóveda,
// tiene que poder recibir el ticket y contestarlo igual. Compartir una nota ES
// el permiso para esa nota, y se pide en la pantalla de compartir.
//
// Por eso `ready()` de `upload.ts` NO se reusa acá.

import { supabase } from './supabase';
import { db, markSentToCloud } from '../storage/db';
import {
	sharedNoteIdsByRole,
	getShareCursor,
	setShareCursor,
	setShareRole
} from '../storage/shares';
import { rememberShareName } from '../storage/share-names';
import { toSharedPayload } from './shared-payload';
import { mergeFromShared, sameInAllowList } from './shared-merge';

const BATCH = 200;
// El servidor reparte `server_seq` al EMPEZAR la escritura, no al confirmarla,
// así que dos escritores pueden hacerla visible fuera de orden. Mismo motivo y
// mismo número que en `download.ts`; no reinventar el razonamiento.
const OVERLAP = 50;

const SHARED_TABLES = ['notes', 'blocks', 'activity'];

export async function sharedReady() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	if (!data.session) return null;
	return client;
}

const changedSinceCloud = (row) => row.cloudSeq !== row.changeSeq;

// Qué falta subir de UNA nota. El invitado ofrece sólo bitácora: es el espejo
// del lado del cliente de la comprobación de rol del SQL, y es el que un
// llamador nuevo no se puede olvidar.
export async function listSharedPending(noteId, role) {
	if (!role) return [];
	const tables = role === 'member' ? ['activity'] : SHARED_TABLES;
	const out = [];
	for (const table of tables) {
		const rows =
			table === 'notes'
				? [await db.table('notes').get(noteId)].filter(Boolean)
				: await db.table(table).where('noteId').equals(noteId).toArray();
		for (const row of rows) {
			if (changedSinceCloud(row)) out.push({ table, row });
		}
	}
	return out.sort((a, b) => a.row.changeSeq - b.row.changeSeq).slice(0, BATCH);
}

export async function countSharedPending() {
	const { owner, member } = await sharedNoteIdsByRole();
	let total = 0;
	for (const [ids, role] of [
		[owner, 'owner'],
		[member, 'member']
	]) {
		for (const noteId of ids) total += (await listSharedPending(noteId, role)).length;
	}
	return total;
}

export async function pushSharedNote(client, noteId, role) {
	const pending = await listSharedPending(noteId, role);
	if (!pending.length) return 0;
	const rows = pending.map(({ table, row }) => ({
		table_name: table,
		id: row.id,
		change_seq: row.changeSeq,
		base_seq: row.cloudSeq ?? null,
		deleted: Boolean(row.deletedAt),
		payload: toSharedPayload(table, row)
	}));
	const { data, error } = await client.rpc('push_shared_rows', {
		p_note_id: noteId,
		payload: rows
	});
	if (error) throw new Error(error.message);
	const refused = new Set((data ?? []).map((row) => `${row.rejected_table}:${row.rejected_id}`));
	let accepted = 0;
	for (const { table, row } of pending) {
		if (refused.has(`${table}:${row.id}`)) continue;
		await markSentToCloud(table, row.id, row.changeSeq);
		accepted++;
	}
	return accepted;
}

// Devuelve cuántas filas CAMBIARON algo acá, no cuántas vinieron. La diferencia
// no es cosmética: es lo que decide si hay que despertar a la pantalla, y la
// ventana de relectura de arriba vuelve a traer en CADA pasada filas que este
// aparato ya tiene —las suyas propias, sin ir más lejos—. Contándolas a todas,
// la nota abierta se refrescaría cada 30 segundos para nada.
export async function pullSharedNote(client, noteId) {
	const cursor = await getShareCursor(noteId);
	const { data, error } = await client.rpc('pull_shared_rows', {
		p_note_id: noteId,
		p_cursor: Math.max(0, cursor - OVERLAP)
	});
	if (error) throw new Error(error.message);
	if (!data?.length) return 0;
	let applied = 0;
	for (const row of data) {
		const local = await db.table(row.table_name).get(row.id);
		if (sameInAllowList(row.table_name, local, row.payload)) continue;
		await mergeFromShared(row.table_name, row.payload, row.change_seq);
		applied++;
	}
	await setShareCursor(noteId, data[data.length - 1].server_seq);
	return applied;
}

// "¿En qué estoy?" — y la respuesta manda sobre la marca local, no al revés.
//
// Corre ANTES de la subida cifrada de cada sesión, y eso es una condición de
// orden, no una preferencia. La marca `share` NO está en tres situaciones que
// pasan solas: después de restaurar un respaldo (no es respaldable a propósito),
// en un aparato que nunca vio la nota, y después de cerrar sesión — y
// `resetCloudState` deja `cloudSeq` vacío en TODAS las filas, así que en esos
// aparatos la nota entera está pendiente sin que nadie la edite. Si la subida
// cifrada corre primero, la nota se va por el caño equivocado y queda en los dos.
// Devuelve además cuántas marcas CAMBIARON, por el mismo motivo que
// `pullSharedNote` cuenta filas y no llegadas: es lo único que puede despertar a
// la pantalla cuando el otro aparato compartió la nota. Sin ese número la marca
// entra a la base y la lista no la muestra hasta recargar.
export async function reconcileShares(client) {
	const { data, error } = await client.rpc('list_shares');
	if (error) throw new Error(error.message);
	// El valor es un OBJETO y no el rol pelado, desde que `list_shares` devuelve
	// también el nombre del otro. Un objeto y no un arreglo a propósito: recorrer
	// un Map entrega `[clave, valor]`, así que un valor-arreglo obliga a
	// desestructurar dos niveles y ese paréntesis de más es justo el que se olvida
	// en el segundo llamador — y ahí el rol deja de ser 'member', el candado de
	// `listSharedPending` se abre y el caño ofrece las tres tablas de una nota
	// ajena. Hay una prueba que lo vigila en `shared.test.ts`.
	const fromServer = new Map(
		(data ?? []).map((row) => [row.note_id, { role: row.role, label: row.counterpart_label }])
	);
	const { owner, member } = await sharedNoteIdsByRole();
	const local = new Map();
	for (const noteId of owner) local.set(noteId, 'owner');
	for (const noteId of member) local.set(noteId, 'member');
	let changed = 0;
	for (const [noteId, { role, label }] of fromServer) {
		// El nombre se guarda aunque el rol no haya cambiado: el dueño puede
		// corregir cómo firma, y eso llega por acá sin mover ninguna marca. Un nulo
		// NO se guarda: una compartición abierta antes de que los nombres existieran
		// devuelve nulo para siempre, y escribirlo borraría el bueno.
		if (label) await rememberShareName(`owner:${noteId}`, label);
		if (local.get(noteId) === role) continue;
		await setShareRole(noteId, role);
		changed++;
	}
	// Una nota que este aparato cree compartida y el servidor no: la compartición
	// se cerró en otro lado. Se le saca la marca y vuelve al caño cifrado, que es
	// lo que hace la otra mitad de la mudanza.
	for (const noteId of local.keys()) {
		if (fromServer.has(noteId)) continue;
		await setShareRole(noteId, null);
		changed++;
	}
	return { shares: fromServer, changed };
}

// Devuelve cuántas filas cambiaron acá, para que `syncNow` pueda avisarle a la
// pantalla. Sin ese número, lo que llega por el caño compartido aterriza en la
// base y no lo ve nadie hasta recargar: `appliedVersion` —la única campanita que
// dice "llegó algo, refrescá"— la tocaba SÓLO el caño cifrado.
export async function syncShared(client) {
	const { shares, changed } = await reconcileShares(client);
	let applied = changed;
	for (const [noteId, { role }] of shares) {
		await pushSharedNote(client, noteId, role);
		applied += await pullSharedNote(client, noteId);
	}
	return applied;
}
