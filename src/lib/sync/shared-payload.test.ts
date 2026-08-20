import { describe, expect, it } from 'vitest';
import { toSharedPayload, cleanSharedPayload } from './shared-payload';

describe('lo que viaja', () => {
	it('deja en casa la organización, y también un campo que nadie declaró', () => {
		const note = {
			id: 'n1',
			title: 'Título',
			updatedAt: '2026-08-13T00:00:00.000Z',
			deletedAt: null,
			folderId: 'f1',
			sortOrder: -3,
			agentVisible: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			changeSeq: 99,
			cloudSeq: 98,
			inventadoDespues: 'no debería viajar'
		};

		expect(toSharedPayload('notes', note)).toEqual({
			id: 'n1',
			title: 'Título',
			updatedAt: '2026-08-13T00:00:00.000Z',
			deletedAt: null
		});
	});

	// La comparación es del objeto ENTERO y no campo por campo a propósito: así
	// un campo agregado a la fila más adelante rompe esta prueba en vez de
	// viajar callado. `order` (la estructura de la nota) sí viaja; `collapsed`
	// (cómo la mira quien lee), `note`, `createdBy` y `updatedAt` no.
	it('manda la estructura interna del renglón y no cómo lo mira quien lee', () => {
		const payload = toSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			parentBlockId: null,
			order: 2,
			type: 'todo',
			content: 'Llamar',
			html: '<strong>Llamar</strong>',
			checked: false,
			dueDate: '2026-08-20',
			deletedAt: null,
			collapsed: true,
			note: 'comentario privado del dueño',
			createdBy: 'agent',
			updatedAt: '2026-08-13T00:00:00.000Z'
		});

		expect(payload).toEqual({
			id: 'b1',
			noteId: 'n1',
			parentBlockId: null,
			order: 2,
			type: 'todo',
			content: 'Llamar',
			html: '<strong>Llamar</strong>',
			checked: false,
			dueDate: '2026-08-20',
			deletedAt: null
		});
	});
});

// Encontrado en el gate manual del 2026-08-14: se borró una nota compartida de
// verdad y su título y sus 45 renglones quedaron legibles en el servidor.
describe('una lápida no se lleva el texto puesto', () => {
	it('de una nota borrada sube el nombre y nada de lo que decía', () => {
		const payload = toSharedPayload('notes', {
			id: 'n1',
			title: 'Plantillas de mail de la empresa',
			updatedAt: '2026-08-14T00:00:00.000Z',
			deletedAt: '2026-08-14T00:00:00.000Z'
		});

		expect(payload).toEqual({
			id: 'n1',
			updatedAt: '2026-08-14T00:00:00.000Z',
			deletedAt: '2026-08-14T00:00:00.000Z'
		});
		expect(JSON.stringify(payload)).not.toContain('Plantillas');
	});

	it('de un renglón borrado no sube ni el texto ni el marcado', () => {
		const payload = toSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			content: 'la clave del wifi es 1234',
			html: '<strong>la clave del wifi es 1234</strong>',
			type: 'todo',
			checked: true,
			deletedAt: '2026-08-14T00:00:00.000Z'
		});

		expect(payload).toEqual({
			id: 'b1',
			noteId: 'n1',
			deletedAt: '2026-08-14T00:00:00.000Z'
		});
	});

	it('y una lápida que llega no le cambia el tipo al renglón de quien la recibe', () => {
		const clean = cleanSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			deletedAt: '2026-08-14T00:00:00.000Z'
		});

		expect(clean.type).toBeUndefined();
		expect(clean.dueDate).toBeUndefined();
	});
});

// Spec 041 §8: una imagen es local y sin sincronizar. Mandarla a medias por
// el caño compartido (sólo la descripción, sin el cuerpo) sería fingir que
// viajó entera — mejor que el caño se frene ACÁ, en voz alta.
describe('spec 041: el caño compartido no manda imágenes a medias', () => {
	it('spec 041: el caño compartido RECHAZA una imagen, no la manda a medias', () => {
		expect(() =>
			toSharedPayload('blocks', { type: 'image', content: 'x', imageId: 'a'.repeat(64) })
		).toThrow(/imagen/i);
	});

	it('una lápida de un bloque de imagen SÍ viaja: no lleva pixeles, sólo dice que ya no está', () => {
		expect(() =>
			toSharedPayload('blocks', {
				id: 'b1',
				noteId: 'n1',
				type: 'image',
				content: 'x',
				imageId: 'a'.repeat(64),
				deletedAt: '2026-08-20T00:00:00.000Z'
			})
		).not.toThrow();
	});
});

describe('lo que llega se limpia, lo escribió quien lo escribió', () => {
	it('desarma el marcado que no está en la lista blanca y deja el texto', () => {
		const clean = cleanSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			type: 'todo',
			content: 'hola',
			html: '<img src=x onerror="robar()"><strong>hola</strong>',
			dueDate: '2026-08-20'
		});

		expect(clean.html).not.toContain('onerror');
		expect(clean.html).not.toContain('<img');
		expect(clean.html).toContain('<strong>hola</strong>');
	});

	it('un tipo desconocido cae a texto y una fecha imposible se va', () => {
		const clean = cleanSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			type: 'no-existe',
			content: 'hola',
			html: 'hola',
			dueDate: '2026-02-30'
		});

		expect(clean.type).toBe('text');
		expect(clean.dueDate).toBe(null);
	});

	it('no toca lo que no es un renglón', () => {
		const note = { id: 'n1', title: 'Título', updatedAt: 'x', deletedAt: null };
		expect(cleanSharedPayload('notes', note)).toEqual(note);
	});
});
