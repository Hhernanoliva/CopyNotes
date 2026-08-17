// Cómo se llama la otra persona (spec 038 §6).
//
// Es un CACHE, no contenido: se llena con lo que contesta el servidor y se puede
// tirar entero sin perder nada. Por eso su tabla —`shareMembers`, la v11 de
// Dexie— no está en `SYNCED_TABLES` (subirla sería subir un cachecito de nombres
// ajenos) ni en `BACKUP_TABLES` (los dejaría en un archivo en claro), y quedarse
// afuera de esa segunda lista es además lo que la salva de `replaceAllTables`,
// que vacía exactamente esa lista.
//
// Dos clases de id conviven adentro, y no se pisan porque una lleva prefijo: el
// uuid pelado de un invitado, y `owner:<noteId>` para el dueño de una nota que
// nos comparten. El segundo existe porque del dueño no sabemos el uuid — lo
// único que llega de él es su nombre, en la tercera columna de `list_shares`.

import { db } from './db';

const limpio = (name) => (typeof name === 'string' && name.trim() ? name.trim() : null);

export async function rememberShareName(id, name) {
	await db.table('shareMembers').put({ id, name: limpio(name) });
}

export async function getShareName(id) {
	return limpio((await db.table('shareMembers').get(id))?.name);
}

// Lo que llaman las pantallas. Una compartición abierta antes de que los nombres
// existieran no tiene ninguno, y ese nulo llega hasta acá.
export async function shareNameOr(id, fallback) {
	return (await getShareName(id)) ?? fallback;
}
