// La regla de una línea que hace segura la sincronización rápida: nunca se pisa
// un renglón que estás escribiendo o que todavía no terminó de guardarse.

import { describe, expect, it } from 'vitest';
import { reconcileBlocks } from './reconcile';

const block = (id, content, extra = {}) => ({ id, content, order: 0, ...extra });

describe('traer lo que llegó de afuera', () => {
	it('actualiza los renglones que nadie está tocando', () => {
		const current = [block('a', 'vieja'), block('b', 'otra')];
		const incoming = [block('a', 'nueva'), block('b', 'otra')];

		const { blocks: next } = reconcileBlocks(current, incoming, new Set());

		expect(next.map((row) => row.content)).toEqual(['nueva', 'otra']);
	});

	it('deja intacto el renglón donde está el cursor, aunque llegue distinto', () => {
		const mine = block('a', 'lo que estoy escribiendo');
		const current = [mine, block('b', 'otra')];
		const incoming = [block('a', 'lo que escribió el otro'), block('b', 'otra')];

		const { blocks: next } = reconcileBlocks(current, incoming, new Set(['a']));

		// El mismo objeto, no una copia: nada re-renderiza ese renglón.
		expect(next[0]).toBe(mine);
		expect(next[0].content).toBe('lo que estoy escribiendo');
	});

	it('deja intacto un renglón cuyo guardado todavía no aterrizó', () => {
		const pendiente = block('b', 'tipeado hace 200 ms');
		const current = [block('a', 'una'), pendiente];
		const incoming = [block('a', 'una'), block('b', 'la versión vieja del servidor')];

		const { blocks: next } = reconcileBlocks(current, incoming, new Set(['b']));

		expect(next[1]).toBe(pendiente);
	});

	it('suma los renglones nuevos y saca los borrados, en el orden del almacenamiento', () => {
		const current = [block('a', 'una'), block('vieja', 'se borró en el otro dispositivo')];
		const incoming = [block('nueva', 'llegó de allá'), block('a', 'una')];

		const { blocks: next } = reconcileBlocks(current, incoming, new Set());

		expect(next.map((row) => row.id)).toEqual(['nueva', 'a']);
	});

	it('no desaparece un renglón protegido que el almacenamiento todavía no conoce', () => {
		// Recién creado con Enter: la escritura está en vuelo y el cursor ya está
		// adentro. Sacarlo sería el mismo daño que veníamos a evitar.
		const recien = block('nuevo', 'escribiendo acá');
		const current = [block('a', 'una'), recien, block('b', 'otra')];
		const incoming = [block('a', 'una'), block('b', 'otra')];

		const { blocks: next } = reconcileBlocks(current, incoming, new Set(['nuevo']));

		expect(next.map((row) => row.id)).toEqual(['a', 'nuevo', 'b']);
		expect(next[1]).toBe(recien);
	});

	it('avisa qué renglones quedaron esperando, para poder reintentarlo', () => {
		// Sin este aviso, un renglón protegido se queda con la versión vieja hasta
		// que llegue OTRO cambio de la nube — y si mientras tanto lo editás, subís
		// esa versión vieja y pisás la del otro dispositivo.
		const current = [block('a', 'lo mío'), block('b', 'otra')];
		const incoming = [block('a', 'lo del otro'), block('b', 'otra')];

		const { deferred } = reconcileBlocks(current, incoming, new Set(['a']));

		expect(deferred).toEqual(['a']);
		expect(reconcileBlocks(current, incoming, new Set()).deferred).toEqual([]);
	});

	it('un renglón protegido que borraron en el otro aparato también espera turno', () => {
		// Se queda en pantalla (el cursor está adentro), pero tiene que volver a
		// intentarse: sin eso el borrado del otro aparato no se aplicaba NUNCA, y
		// la próxima edición volvía a subir un renglón que allá ya no existe.
		const mio = block('a', 'estoy escribiendo acá');
		const current = [mio, block('b', 'otra')];
		const incoming = [block('b', 'otra')];

		const { blocks: next, deferred } = reconcileBlocks(current, incoming, new Set(['a']));

		expect(next.map((row) => row.id)).toEqual(['a', 'b']);
		expect(deferred).toEqual(['a']);

		// Y cuando el cursor se va, el reintento sí lo saca.
		expect(reconcileBlocks(next, incoming, new Set()).blocks.map((row) => row.id)).toEqual(['b']);
	});

	it('avisa cuando la lista ganó o perdió renglones, para tirar el historial de Deshacer', () => {
		// Las fotos de Deshacer no conocen el renglón que acaba de llegar de la
		// nube, y "no está en la foto" se lee como "lo borraste": deshacer lo
		// borraba de verdad.
		const current = [block('a', 'una')];

		expect(reconcileBlocks(current, [block('a', 'una'), block('nueva', 'de allá')], new Set())
			.historyStale).toBe(true);
		expect(reconcileBlocks(current, [], new Set()).historyStale).toBe(true);
		// Un renglón recién creado que el almacenamiento no conoce se queda en su
		// lugar, así que la lista no cambió y el historial no se tira.
		expect(
			reconcileBlocks([block('a', 'una'), block('nuevo', '')], [block('a', 'una')], new Set(['nuevo']))
				.historyStale
		).toBe(false);
	});

	it('avisa también cuando sólo cambió el TEXTO de un renglón que ya existía', () => {
		// El hueco que dejó el arreglo anterior: si el otro aparato edita un
		// renglón sin agregar ni borrar ninguno, la lista no cambia — pero las
		// fotos de Deshacer siguen guardando el texto viejo, y deshacer cualquier
		// otra cosa lo restaura encima de lo que llegó.
		const current = [block('a', 'lo que había'), block('b', 'otra')];
		const incoming = [block('a', 'lo que escribió el otro'), block('b', 'otra')];

		expect(reconcileBlocks(current, incoming, new Set()).historyStale).toBe(true);
	});

	it('no tira el historial cuando no cambió nada de lo que se ve', () => {
		// Cada refresco relee el almacenamiento y devuelve objetos nuevos, y el
		// sellado de la nube reescribe `updatedAt`/`changeSeq`/`cloudSeq` sin que
		// el texto se mueva. Si eso contara como cambio, cualquier tic de
		// sincronización te dejaría sin Deshacer.
		const current = [block('a', 'una', { updatedAt: '2026-08-01T10:00:00.000Z', changeSeq: 1 })];
		const incoming = [
			block('a', 'una', { updatedAt: '2026-08-03T18:00:00.000Z', changeSeq: 9, cloudSeq: 9 })
		];

		expect(reconcileBlocks(current, incoming, new Set()).historyStale).toBe(false);
	});

	it('un renglón protegido que llegó distinto no tira el historial todavía', () => {
		// No se aplicó nada: el renglón en pantalla sigue siendo el mío. Tirar el
		// historial acá sería perderlo sin razón; el reintento de cuando el cursor
		// se va es el que avisa.
		const current = [block('a', 'lo mío a medio escribir')];
		const incoming = [block('a', 'lo del otro')];

		expect(reconcileBlocks(current, incoming, new Set(['a'])).historyStale).toBe(false);
	});

	it('un renglón deja de estar protegido y recién ahí toma lo que llegó', () => {
		const current = [block('a', 'lo mío')];
		const incoming = [block('a', 'lo del otro dispositivo')];

		const protegido = reconcileBlocks(current, incoming, new Set(['a'])).blocks;
		const libre = reconcileBlocks(protegido, incoming, new Set()).blocks;

		expect(protegido[0].content).toBe('lo mío');
		expect(libre[0].content).toBe('lo del otro dispositivo');
	});
});
