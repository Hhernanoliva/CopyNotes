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

export function toSharedPayload(table, row) {
	const payload = {};
	for (const field of SHARED_FIELDS[table] ?? []) {
		if (row[field] !== undefined) payload[field] = row[field];
	}
	return payload;
}

export function cleanSharedPayload(table, payload) {
	if (table !== 'blocks') return payload;
	const type = BLOCK_TYPES.includes(payload.type) ? payload.type : 'text';
	return {
		...payload,
		type,
		...(typeof payload.html === 'string' ? { html: sanitizeHtml(payload.html) } : {}),
		// Un separador nunca lleva fecha, y una fecha con formato válido puede
		// seguir siendo un día que no existe. Misma regla que `format/ingest.ts`.
		dueDate: type === 'separator' ? null : isValidDueDate(payload.dueDate) ? payload.dueDate : null
	};
}
