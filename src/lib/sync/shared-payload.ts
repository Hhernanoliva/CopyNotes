// Qué de una fila viaja por el caño compartido, y qué le pasa a una fila que
// llega. Dos direcciones, un archivo: la lista se lee entera de un vistazo y no
// se puede actualizar una mitad sola.
//
// SALIDA — lista blanca, prohibido salvo lo declarado, igual que
// `format/sanitize.ts` y por el mismo motivo: lo que falla de una lista NEGRA es
// una fuga que no se nota. Un campo agregado a la fila más adelante NO viaja
// hasta que alguien lo agregue acá a propósito.
//
// ENTRADA — esto es una frontera de confianza NUEVA. El caño cifrado trae
// bultos que escribió un aparato tuyo con tu llave; el compartido trae marcado
// escrito por el cliente de OTRA cuenta, y `block.html` es un sumidero de
// innerHTML. La regla que el proyecto ya aplica a un archivo de respaldo —"es
// sospechoso lo escriba quien lo escriba"— vale igual acá: que te hayan
// invitado no es motivo para ejecutar su marcado.

import { sanitizeHtml } from '$lib/format';
import { BLOCK_TYPES } from '$lib/format/blocktype';
import { isValidDueDate } from '$lib/dates';

export const SHARED_FIELDS = {
	notes: ['id', 'title', 'updatedAt', 'deletedAt'],
	blocks: [
		'id',
		'noteId',
		'parentBlockId',
		'order',
		'type',
		'content',
		'html',
		'checked',
		'dueDate',
		'deletedAt'
	],
	activity: ['id', 'blockId', 'noteId', 'actor', 'action', 'text', 'seq', 'at', 'deletedAt']
};

// Una lápida dice "esto ya no está", NUNCA lo que decía.
//
// Encontrado corriendo el gate manual (2026-08-14): al borrar una nota
// compartida su título y sus 45 renglones quedaban LEGIBLES en el servidor para
// siempre. El borrado viajaba bien —la fila se marcaba borrada de los dos
// lados— y el texto se quedaba arriba, porque la lápida se lo llevaba puesto.
// En el caño cifrado la misma lápida es inofensiva: lo que queda es un bulto
// que nadie puede abrir, y por eso esta regla no existía en `records`.
//
// Se queda sólo lo que IDENTIFICA la fila. `noteId`/`blockId` van porque sin
// ellos una lápida que llega a un aparato que nunca vio esa fila crea una fila
// huérfana; el contenido no hace falta para nada: la fila está borrada.
const IDENTITY_FIELDS = {
	notes: ['id', 'updatedAt', 'deletedAt'],
	blocks: ['id', 'noteId', 'deletedAt'],
	activity: ['id', 'noteId', 'blockId', 'deletedAt']
};

export function toSharedPayload(table, row) {
	const fields = (row.deletedAt ? IDENTITY_FIELDS[table] : SHARED_FIELDS[table]) ?? [];
	const payload = {};
	for (const field of fields) {
		if (row[field] !== undefined) payload[field] = row[field];
	}
	return payload;
}

// Se normaliza lo que VINO, y no se inventa lo que faltaba: la carga es una
// proyección de la fila, y desde la lápida de arriba puede traer tres campos y
// nada más. Poniendo `type` siempre, una lápida de renglón convertía en texto
// plano —del lado del que la recibe— un renglón que era una tarea.
export function cleanSharedPayload(table, payload) {
	if (table !== 'blocks') return payload;
	const clean = { ...payload };
	if ('type' in payload) {
		clean.type = BLOCK_TYPES.includes(payload.type) ? payload.type : 'text';
	}
	if (typeof payload.html === 'string') clean.html = sanitizeHtml(payload.html);
	// Un separador nunca lleva fecha, y una fecha con formato válido puede
	// seguir siendo un día que no existe. Misma regla que `format/ingest.ts`.
	if ('dueDate' in payload) {
		clean.dueDate =
			clean.type === 'separator' ? null : isValidDueDate(payload.dueDate) ? payload.dueDate : null;
	}
	return clean;
}
