// Escribir una fila que llegó por el caño compartido.
//
// NADA de `sync/` sirve tal cual acá, y las tres formas de romperse son
// distintas (spec 038 §3b). `putFromCloud` hace `put`, o sea que REEMPLAZA la
// fila guardada: aplicar así una carga compartida en el otro aparato del dueño
// borra `folderId`, `sortOrder`, `agentVisible`, `blocks.note` y —lo grave—
// `notes.share`, con lo cual la nota deja de estar marcada como compartida y a
// la pasada siguiente se va por el caño cifrado. `sameToTheUser` compara la
// unión de los campos de los dos lados, así que un `folderId` local contra uno
// ausente es un desacuerdo y estaciona un conflicto por diseño. Y `takeRemote`
// hace las dos cosas, porque pasa por `putFromCloud`.
//
// Así que el caño compartido tiene sus dos líneas propias, escritas AL LADO de
// las originales y no en lugar de ellas.

import { db } from '../storage/db';
import { now } from '../storage/ids';
import { topSortOrder } from '../storage/organize';
import { SHARED_FIELDS, cleanSharedPayload } from './shared-payload';

// Los cuatro campos que sólo se crean. `createNote` es el único lugar de la app
// que los inventa, y una nota que llega por acá no pasa por ahí: sin esto la
// nota queda SIN `sortOrder`, y una fila sin posición se ordena última y se
// queda última para siempre (`normalizeSidebarOrder` sólo corre al restaurar un
// respaldo, nunca al bajar de la nube).
async function birthFields(table) {
	if (table !== 'notes') return {};
	return {
		sortOrder: await topSortOrder('note'),
		folderId: null,
		agentVisible: false,
		createdAt: now()
	};
}

export async function mergeFromShared(table, payload, changeSeq) {
	const clean = cleanSharedPayload(table, payload);
	const local = await db.table(table).get(clean.id);
	const merged = {
		...(local ?? (await birthFields(table))),
		...clean,
		changeSeq,
		cloudSeq: changeSeq,
		fromCloud: true
	};
	await db.table(table).put(merged);
}

// "¿Son la misma para quien las mira?", pero mirando sólo lo que se mandó — la
// única lectura honesta cuando media fila nunca salió del otro aparato.
export function sameInAllowList(table, local, payload) {
	if (!local) return false;
	for (const field of SHARED_FIELDS[table] ?? []) {
		if (payload[field] === undefined) continue;
		if (local[field] !== payload[field]) return false;
	}
	return true;
}
