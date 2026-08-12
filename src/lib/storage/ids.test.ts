import { describe, it, expect, afterEach } from 'vitest';
import { createId } from './ids';

// Forma de un UUID versión 4: el 4 fijo y el primer dígito del cuarto grupo
// limitado a 8/9/a/b son lo que lo distingue de 32 dígitos al azar.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const original = crypto.randomUUID;

// Safari sólo ofrece randomUUID en páginas con candadito. Abriendo la app desde
// el celular contra la Mac por red local no hay candadito, y sin respaldo la
// app se caía al crear la primera nota.
function sinCandadito() {
	Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
}

afterEach(() => {
	Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
});

describe('createId', () => {
	it('devuelve un identificador con forma de UUID v4', () => {
		expect(createId()).toMatch(UUID_V4);
	});

	it('sigue devolviendo la misma forma sin randomUUID', () => {
		sinCandadito();
		expect(createId()).toMatch(UUID_V4);
	});

	it('no repite identificadores sin randomUUID', () => {
		sinCandadito();
		const ids = new Set(Array.from({ length: 2000 }, createId));
		expect(ids.size).toBe(2000);
	});
});
