import { describe, expect, it } from 'vitest';
import { deriveChecked } from './derive';

// `serverSeq` es el orden que repartió el servidor; `seq` es el reloj local.
const linea = (action, serverSeq, seq = 0) => ({ action, serverSeq, seq, actor: 'user' });

describe('deriveChecked', () => {
	it('sin ninguna línea de tilde no opina', () => {
		expect(deriveChecked([])).toBe(null);
		expect(deriveChecked(undefined)).toBe(null);
		expect(deriveChecked([linea('created', 1), linea('note', 2)])).toBe(null);
	});

	it('la última línea manda', () => {
		expect(deriveChecked([linea('done', 10), linea('reopened', 20)])).toBe(false);
		expect(deriveChecked([linea('reopened', 20), linea('done', 30)])).toBe(true);
	});

	// El orden lo decide el servidor, no el que traiga la lista ni el reloj de
	// ningún aparato: con dos cuentas son dos relojes y uno atrasado ganaría.
	it('el orden lo decide el servidor, no el de la lista', () => {
		expect(deriveChecked([linea('done', 30), linea('reopened', 20)])).toBe(true);
	});

	it('y le gana al reloj local aunque digan lo contrario', () => {
		// La que subió después (server_seq 30) tiene el seq MÁS VIEJO.
		const vieja = { action: 'done', serverSeq: 30, seq: 1 };
		const nueva = { action: 'reopened', serverSeq: 20, seq: 999 };
		expect(deriveChecked([nueva, vieja])).toBe(true);
	});

	// Una línea que este aparato todavía no subió no llegó al servidor, así que
	// nada pudo llegar después de ella: va última. Es además lo que la persona
	// espera — el tilde que acaba de hacer se ve al toque y no parpadea al aterrizar.
	it('una línea que todavía no subió va última', () => {
		expect(deriveChecked([linea('done', 99), { action: 'reopened', seq: 1 }])).toBe(false);
	});

	it('entre dos sin subir manda el reloj local, que acá sí alcanza', () => {
		const a = { action: 'done', seq: 1 };
		const b = { action: 'reopened', seq: 2 };
		expect(deriveChecked([b, a])).toBe(false);
	});

	it('una línea borrada no cuenta', () => {
		const borrada = { ...linea('reopened', 20), deletedAt: '2026-08-17T10:00:00.000Z' };
		expect(deriveChecked([linea('done', 10), borrada])).toBe(true);
	});

	// La cascada de spec 003 escribe una línea POR TAREA afectada, así que una
	// tarea con hijas puede tener quince. Cada una se deduce con su propia lista.
	it('varias líneas de la misma tarea se resuelven a una sola respuesta', () => {
		const historia = [
			linea('done', 10),
			linea('reopened', 11),
			linea('done', 12),
			linea('reopened', 13)
		];
		expect(deriveChecked(historia)).toBe(false);
	});

	it('no ordena en el lugar la lista que le pasan', () => {
		const rows = [linea('done', 30), linea('reopened', 20)];
		deriveChecked(rows);
		expect(rows.map((r) => r.serverSeq)).toEqual([30, 20]);
	});
});
