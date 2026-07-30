// La regla de una línea que hace segura la sincronización rápida: nunca se pisa
// un renglón que estás escribiendo o que todavía no terminó de guardarse.

import { describe, expect, it } from 'vitest';
import { reconcileBlocks } from './reconcile';

const block = (id, content, extra = {}) => ({ id, content, order: 0, ...extra });

describe('traer lo que llegó de afuera', () => {
	it('actualiza los renglones que nadie está tocando', () => {
		const current = [block('a', 'vieja'), block('b', 'otra')];
		const incoming = [block('a', 'nueva'), block('b', 'otra')];

		const next = reconcileBlocks(current, incoming, new Set());

		expect(next.map((row) => row.content)).toEqual(['nueva', 'otra']);
	});

	it('deja intacto el renglón donde está el cursor, aunque llegue distinto', () => {
		const mine = block('a', 'lo que estoy escribiendo');
		const current = [mine, block('b', 'otra')];
		const incoming = [block('a', 'lo que escribió el otro'), block('b', 'otra')];

		const next = reconcileBlocks(current, incoming, new Set(['a']));

		// El mismo objeto, no una copia: nada re-renderiza ese renglón.
		expect(next[0]).toBe(mine);
		expect(next[0].content).toBe('lo que estoy escribiendo');
	});

	it('deja intacto un renglón cuyo guardado todavía no aterrizó', () => {
		const pendiente = block('b', 'tipeado hace 200 ms');
		const current = [block('a', 'una'), pendiente];
		const incoming = [block('a', 'una'), block('b', 'la versión vieja del servidor')];

		const next = reconcileBlocks(current, incoming, new Set(['b']));

		expect(next[1]).toBe(pendiente);
	});

	it('suma los renglones nuevos y saca los borrados, en el orden del almacenamiento', () => {
		const current = [block('a', 'una'), block('vieja', 'se borró en el otro dispositivo')];
		const incoming = [block('nueva', 'llegó de allá'), block('a', 'una')];

		const next = reconcileBlocks(current, incoming, new Set());

		expect(next.map((row) => row.id)).toEqual(['nueva', 'a']);
	});

	it('no desaparece un renglón protegido que el almacenamiento todavía no conoce', () => {
		// Recién creado con Enter: la escritura está en vuelo y el cursor ya está
		// adentro. Sacarlo sería el mismo daño que veníamos a evitar.
		const recien = block('nuevo', 'escribiendo acá');
		const current = [block('a', 'una'), recien, block('b', 'otra')];
		const incoming = [block('a', 'una'), block('b', 'otra')];

		const next = reconcileBlocks(current, incoming, new Set(['nuevo']));

		expect(next.map((row) => row.id)).toEqual(['a', 'nuevo', 'b']);
		expect(next[1]).toBe(recien);
	});

	it('un renglón deja de estar protegido y recién ahí toma lo que llegó', () => {
		const current = [block('a', 'lo mío')];
		const incoming = [block('a', 'lo del otro dispositivo')];

		const protegido = reconcileBlocks(current, incoming, new Set(['a']));
		const libre = reconcileBlocks(protegido, incoming, new Set());

		expect(protegido[0].content).toBe('lo mío');
		expect(libre[0].content).toBe('lo del otro dispositivo');
	});
});
