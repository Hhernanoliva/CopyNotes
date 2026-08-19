import { describe, expect, it } from 'vitest';
import { sameToTheUser } from './row-compare';

describe('sameToTheUser', () => {
	it('un texto distinto es un desacuerdo', () => {
		expect(sameToTheUser({ content: 'hola' }, { content: 'chau' })).toBe(false);
	});

	it('un campo que sólo tiene un lado también', () => {
		expect(sameToTheUser({ content: 'hola' }, { content: 'hola', dueDate: '2026-08-17' })).toBe(
			false
		);
	});

	// El bookkeeping se reescribe solo en cada tic de sincronización. Contándolo,
	// cualquier pasada de la nube se vería como una edición sin que nada cambie en
	// pantalla — y en el editor invalidaría el historial de Deshacer.
	it('los sellos de sincronización no lo son', () => {
		const antes = { content: 'hola', changeSeq: 1, cloudSeq: 1, updatedAt: 'a' };
		const despues = { content: 'hola', changeSeq: 9, cloudSeq: 9, updatedAt: 'b' };
		expect(sameToTheUser(antes, despues)).toBe(true);
	});

	// Spec 038 §5: el orden que reparte el servidor a cada línea de bitácora es
	// bookkeeping igual que los demás. Sin esto, una línea que vuelve a llegar por
	// la ventana de relectura con su número actualizado estacionaría un conflicto.
	it('ni el orden que reparte el servidor', () => {
		expect(sameToTheUser({ text: 'listo', serverSeq: 1 }, { text: 'listo', serverSeq: 9 })).toBe(
			true
		);
	});
});
