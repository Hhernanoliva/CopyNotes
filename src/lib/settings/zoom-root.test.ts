import { describe, expect, it } from 'vitest';
import { MAX_NOTES, rememberZoomRoot } from './zoom-root';

describe('rememberZoomRoot', () => {
	it('guarda dónde quedó parada la persona en esa nota', () => {
		expect(rememberZoomRoot({}, 'n1', 'b1')).toEqual({ n1: 'b1' });
	});

	it('salir de la vista borra la entrada en vez de dejarla en null', () => {
		expect(rememberZoomRoot({ n1: 'b1' }, 'n1', null)).toEqual({});
	});

	// Rojo si se saca el `delete` de antes de volver a poner la clave: sin eso la
	// nota conserva su lugar viejo en el orden y la poda tira la más reciente.
	it('reescribir una nota la vuelve la más reciente', () => {
		const map = rememberZoomRoot(rememberZoomRoot({ n1: 'b1' }, 'n2', 'b2'), 'n1', 'bZ');
		expect(Object.keys(map)).toEqual(['n2', 'n1']);
	});

	// Rojo si se borra la línea del `slice`: la clave crece para siempre con cada
	// nota que alguna vez se abrió.
	it(`poda a ${MAX_NOTES} notas y tira las más viejas`, () => {
		let map = {};
		for (let i = 0; i < MAX_NOTES + 5; i += 1) map = rememberZoomRoot(map, `n${i}`, `b${i}`);
		expect(Object.keys(map).length).toBe(MAX_NOTES);
		expect(Object.keys(map)).not.toContain('n0');
		expect(map[`n${MAX_NOTES + 4}`]).toBe(`b${MAX_NOTES + 4}`);
	});
});
