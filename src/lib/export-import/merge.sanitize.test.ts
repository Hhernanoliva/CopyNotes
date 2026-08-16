// El orden entre limpiar el marcado y comparar las filas, y por qué importa.
//
// Encontrado en el gate de la spec 040 (2026-08-16) con el archivo real de Hernán:
// después de arreglar los campos ausentes, el resumen todavía decía 343 renglones
// "cambiados en los dos lados". Medido: **326 de sus 1450 bloques cambian de html al
// limpiarlos**, y ni una letra del texto se mueve —
//
//   antes:   cellpadding=&quot;0&quot;
//   después: cellpadding="0"
//
// `plainTextToHtml` escapa la comilla como `&quot;` al guardar texto pelado, y
// `sanitizeHtml` la vuelve a escribir como `"` cuando reserializa (en el texto de un
// nodo la comilla no necesita escaparse). Las dos formas se ven igual en pantalla.
//
// La app comparaba la fila del archivo YA LIMPIA contra la fila guardada SIN limpiar,
// así que cada renglón con una comilla adentro parecía haber cambiado y se guardaba
// por duplicado. La comparación tiene que ser entre lo que vino y lo que hay; la
// limpieza es una transformación de lo que se va a ESCRIBIR, y ahí sigue estando.
//
// Corre bajo jsdom: `sanitizeHtml` necesita un `DOMParser`.

import { describe, expect, it } from 'vitest';
import { sanitizeBackupData } from '../format/ingest';
import { plainTextToHtml } from '../format';
import { planMerge } from './merge';

const iso = '2026-07-10T12:00:00.000Z';

function tables(overrides = {}) {
	return {
		notes: [],
		blocks: [],
		snippets: [],
		tags: [],
		tagAssignments: [],
		folders: [],
		activity: [],
		settings: [],
		...overrides
	};
}

function block(overrides = {}) {
	return {
		id: 'b1',
		noteId: 'n1',
		parentBlockId: null,
		type: 'text',
		content: 'dice "hola"',
		html: plainTextToHtml('dice "hola"'),
		order: 1000,
		collapsed: false,
		checked: false,
		createdAt: iso,
		updatedAt: iso,
		deletedAt: null,
		...overrides
	};
}

const note = { id: 'n1', title: 'N', createdAt: iso, updatedAt: iso, deletedAt: null };

describe('limpiar el marcado y comparar las filas, en ese orden', () => {
	it('una comilla guardada no cuenta como un cambio', () => {
		const local = tables({ notes: [note], blocks: [block()] });
		const incoming = tables({ notes: [note], blocks: [block()] });

		const plan = planMerge(local, incoming, { createId: () => 'nuevo' });

		expect(plan.summary.conflicts).toBe(0);
		expect(plan.summary.blocks.skipped).toBe(1);
	});

	// El bug, escrito como prueba: si alguien vuelve a limpiar ANTES de comparar, esto
	// se pone rojo en vez de duplicarle 326 renglones a alguien.
	it('y limpiar antes de comparar es justamente lo que la duplicaba', () => {
		const local = tables({ notes: [note], blocks: [block()] });
		const incoming = sanitizeBackupData(tables({ notes: [note], blocks: [block()] }));

		const plan = planMerge(local, incoming, { createId: () => 'nuevo' });

		expect(plan.summary.conflicts).toBe(1);
	});

	// Y lo que sí entra, entra limpio: la limpieza no se saltea, se corre sobre el plan.
	it('lo que se inserta pasa igual por la limpieza', () => {
		const local = tables({ notes: [note] });
		const incoming = tables({
			notes: [note],
			blocks: [block({ id: 'b2', html: '<img src=x onerror="robar()">hola' })]
		});

		const plan = planMerge(local, incoming, { createId: () => 'nuevo' });
		const clean = sanitizeBackupData(plan.inserts);

		expect(plan.inserts.blocks).toHaveLength(1);
		expect(clean.blocks[0].html).not.toContain('onerror');
	});
});
