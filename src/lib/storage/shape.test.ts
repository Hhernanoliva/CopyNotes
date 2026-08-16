import { describe, expect, it } from 'vitest';
import { missingShapeFields } from './shape';

const timestamp = '2026-08-16T00:00:00.000Z';

describe('la marca de borrado también se completa', () => {
	// `toMatchObject` y `toHaveProperty` en vez de leerle la propiedad al resultado:
	// `svelte-check` tipa el objeto que devuelve como `{}` pelado y no deja dotear.
	it('una fila sin deletedAt es una fila viva, no una fila inválida', () => {
		for (const table of ['notes', 'blocks', 'activity']) {
			expect(missingShapeFields(table, {}, timestamp)).toMatchObject({ deletedAt: null });
		}
	});

	it('y una lápida conserva su fecha de borrado', () => {
		const tomb = { deletedAt: '2026-08-01T00:00:00.000Z' };
		expect(missingShapeFields('notes', tomb, timestamp)).not.toHaveProperty('deletedAt');
	});
});
