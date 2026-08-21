import { describe, expect, it } from 'vitest';
import { sameToTheUser } from './row-compare';

describe('sameToTheUser', () => {
	it('un texto distinto es un desacuerdo', () => {
		expect(sameToTheUser('blocks', { content: 'hola' }, { content: 'chau' })).toBe(false);
	});

	it('un campo que sólo tiene un lado también', () => {
		expect(
			sameToTheUser('blocks', { content: 'hola' }, { content: 'hola', dueDate: '2026-08-17' })
		).toBe(false);
	});

	// El bookkeeping se reescribe solo en cada tic de sincronización. Contándolo,
	// cualquier pasada de la nube se vería como una edición sin que nada cambie en
	// pantalla — y en el editor invalidaría el historial de Deshacer.
	it('los sellos de sincronización no lo son', () => {
		const antes = { content: 'hola', changeSeq: 1, cloudSeq: 1, updatedAt: 'a' };
		const despues = { content: 'hola', changeSeq: 9, cloudSeq: 9, updatedAt: 'b' };
		expect(sameToTheUser('blocks', antes, despues)).toBe(true);
	});

	// Spec 038 §5: el orden que reparte el servidor a cada línea de bitácora es
	// bookkeeping igual que los demás. Sin esto, una línea que vuelve a llegar por
	// la ventana de relectura con su número actualizado estacionaría un conflicto.
	it('ni el orden que reparte el servidor', () => {
		expect(
			sameToTheUser('activity', { text: 'listo', serverSeq: 1 }, { text: 'listo', serverSeq: 9 })
		).toBe(true);
	});

	// Encontrado al revisar la tarea 11 de spec 041: esta función compara filas
	// crudas por clave — sin el perdón que ya tiene `identical()` de
	// `export-import/merge.ts` — así que una fila que bajó de la nube desde un
	// aparato viejo (sin los cinco campos de imagen) se veía "distinta" de la
	// misma fila local, que sí los tiene en su valor de nacimiento (`null`). La
	// usan `sync/download.ts` (para decidir si una diferencia merece un
	// conflicto) y `editor/reconcile.ts` (para el historial de Deshacer): las dos
	// rutas heredan el arreglo.
	it('un bloque sin los campos de imagen no es un desacuerdo contra uno que los tiene en null', () => {
		const viejo = { content: 'hola' };
		const nuevo = {
			content: 'hola',
			imageId: null,
			imageType: null,
			imageBytes: null,
			imageWidth: null,
			imageHeight: null
		};
		expect(sameToTheUser('blocks', viejo, nuevo)).toBe(true);
	});

	// Y lo que sí es un desacuerdo lo sigue siendo: un valor de imagen real
	// contra su ausencia no se perdona.
	it('pero un imageId real contra su ausencia sigue siendo un desacuerdo', () => {
		const viejo = { content: 'hola' };
		const nuevo = { content: 'hola', imageId: 'a'.repeat(64) };
		expect(sameToTheUser('blocks', viejo, nuevo)).toBe(false);
	});
});
