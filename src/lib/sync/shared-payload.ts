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
import { imageExportText } from '$lib/images/export-text';

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

// Spec 041 §8: una imagen es local, sin sincronizar — sus bytes no existen del
// otro lado del caño. Mandar sólo la descripción y fingir que viajó entera es
// justo la falla que este rechazo evita; se frena en voz alta, no a medias.
// Una lápida (`deletedAt`) SÍ viaja: no lleva píxeles, dice nada más "esto ya
// no está", y frenarla dejaría esa nota compartida sin forma de sincronizar
// nunca más un borrado.
export function toSharedPayload(table, row) {
	if (table === 'blocks' && row.type === 'image' && !row.deletedAt) {
		throw new Error(
			'No se puede compartir un bloque de imagen: la imagen no viaja por el caño compartido.'
		);
	}
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
	// Spec 041 §8, y la TERCERA puerta del mismo marco vacío: `format/ingest.ts`
	// cierra la del portapapeles y `export-import/schema.ts` la del respaldo.
	// Acá la entrada NO es lista blanca —`{ ...payload }` copia todo lo que
	// mandó el otro cliente—, así que un bloque `type: 'image'` llega con su
	// `imageId` y sin bytes: los bytes viven en `imageBodies`, que no viaja por
	// ningún caño. Se degrada a texto, nunca se rechaza, igual que la ingesta.
	//
	// Cierra dos cosas de una: el marco que nunca se llena, y que esa misma fila
	// después atasque la SUBIDA para siempre en `toSharedPayload`.
	if (clean.type === 'image') {
		clean.type = 'text';
		clean.content = imageExportText({ content: payload.content ?? '' });
		clean.html = '';
		// Y sin sus cinco campos: un `imageWidth` ajeno termina interpolado en un
		// atributo `style` (BlockRow.svelte), que con `style-src 'unsafe-inline'`
		// es CSS que escribe el otro cliente.
		clean.imageId = null;
		clean.imageType = null;
		clean.imageBytes = null;
		clean.imageWidth = null;
		clean.imageHeight = null;
	}
	// Un separador nunca lleva fecha, y una fecha con formato válido puede
	// seguir siendo un día que no existe. Misma regla que `format/ingest.ts`.
	if ('dueDate' in payload) {
		clean.dueDate =
			clean.type === 'separator' ? null : isValidDueDate(payload.dueDate) ? payload.dueDate : null;
	}
	return clean;
}
