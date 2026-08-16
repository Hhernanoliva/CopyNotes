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
import { missingShapeFields } from '../storage/shape';
import { SHARED_FIELDS, cleanSharedPayload } from './shared-payload';

// Los campos que sólo se crean, para una fila que este aparato no tenía.
//
// `createNote`, `createBlock` y `appendActivity` son los únicos lugares de la app
// que los inventan, y una fila que llega por acá no pasa por ninguno. Dos cosas
// se rompen sin esto, y las dos se vieron de verdad:
//
//   * Sin `sortOrder`, una nota se ordena última y se queda última para siempre
//     (`normalizeSidebarOrder` sólo corre al restaurar un respaldo, nunca al
//     bajar de la nube).
//   * Sin `collapsed`, el RESPALDO que este aparato exporta deja de pasar su
//     propia validación —"data.blocks.718.collapsed: Expected collapsed but
//     received undefined"— y el archivo entero no se puede importar por un
//     renglón. Encontrado en el gate manual del 2026-08-15 con el archivo real.
//
// Por eso la lista es "todo lo que la forma local exige y el caño puede no
// traer", y no sólo lo que se notaba a simple vista: una LÁPIDA viaja con tres
// campos (ver `IDENTITY_FIELDS`), así que una fila que llega ya borrada, sin
// haber existido nunca acá, llega más pelada todavía.
//
// Van SIEMPRE debajo de lo que vino: si el campo viajó, manda el que viajó.
//
// La lista de campos vive en `storage/shape.ts`, no acá: la comparte con la
// migración v12, que repara las filas escritas incompletas antes de este arreglo.
// Dos copias se separarían, y el lado que se olvide es el que escribe la fila
// rota.
async function birthFields(table) {
	const fields = missingShapeFields(table, {}, now());
	if (table !== 'notes') return fields;
	// `sortOrder` no es un valor fijo, es una posición: se calcula contra lo que ya
	// hay, así que no puede vivir en una tabla de constantes.
	return { ...fields, sortOrder: await topSortOrder('note') };
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
