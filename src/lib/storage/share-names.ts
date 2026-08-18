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

// Cómo se firma una línea de bitácora MIRADA DESDE ESTE APARATO (spec 038 §6).
//
// El mismo `actor: 'user'` significa dos cosas distintas según de qué lado se
// mire: en tu nota sos vos, y en la que te comparten es el dueño. Sin esa
// distinción la pantalla del invitado le atribuye a él todo lo que hizo el otro,
// que es el error más caro que se puede cometer en una función cuyo trabajo
// entero es decir quién hizo qué.
//
// `role` es el rol de ESTE aparato en ESA nota ('owner', 'member' o nada).

const PREFIJO = 'member:';

// Un agente se reconoce POR DESCARTE, y es la trampa más cara de este archivo:
// el `actor` de una línea escrita por el agente NO es la palabra 'agent' — es el
// id del agente conectado (`bridge/ingest.ts` › resolveAgentActor). Cualquier
// comparación contra 'agent' deja al agente sin nombre y no la caza ninguna
// prueba que no use un id de verdad.
//
// Vive acá porque el mismo descarte lo necesitan tres pantallas, y tres copias
// se separan.
export const isAgentActor = (actor) =>
	actor !== 'user' && !String(actor).startsWith(PREFIJO);

export function isMine(actor, { role, myActor }) {
	if (actor === 'user') return role !== 'member';
	return Boolean(myActor) && actor === myActor;
}

export async function actorName(actor, { noteId, role, myActor }) {
	if (isMine(actor, { role, myActor })) return 'Vos';
	if (actor === 'user') return shareNameOr(`owner:${noteId}`, 'La otra persona');
	if (!isAgentActor(actor)) return shareNameOr(String(actor).slice(PREFIJO.length), 'Invitado');
	return 'Agente';
}
