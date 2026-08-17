import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getShareName, rememberShareName, shareNameOr } from './share-names';

describe('el cachecito de nombres de los miembros', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
	});

	it('guarda un nombre y lo devuelve', async () => {
		await rememberShareName('uuid-de-juan', 'Juan');
		expect(await getShareName('uuid-de-juan')).toBe('Juan');
	});

	it('devuelve null para alguien que nunca vio', async () => {
		expect(await getShareName('uuid-desconocido')).toBe(null);
	});

	// El nombre lo escribe el dueño y lo puede corregir: la segunda escritura pisa
	// a la primera en vez de dejar dos filas del mismo uuid.
	it('pisa el nombre anterior del mismo uuid', async () => {
		await rememberShareName('uuid-de-juan', 'Juan');
		await rememberShareName('uuid-de-juan', 'Juan Pérez');
		expect(await getShareName('uuid-de-juan')).toBe('Juan Pérez');
		expect(await db.table('shareMembers').count()).toBe(1);
	});

	// Una compartición abierta por la parte A no tiene ningún nombre, y el
	// servidor devuelve nulo. Que la pantalla muestre "null" sería peor que
	// cualquier frase.
	it('cae en la frase de respaldo cuando no hay nombre', async () => {
		expect(await shareNameOr('uuid-desconocido', 'Quien comparte la nota')).toBe(
			'Quien comparte la nota'
		);
	});

	// Un nombre vacío o de puro espacio es lo mismo que no tener nombre: el campo
	// de texto de la pantalla de invitar deja escribir " " sin quejarse.
	it('trata un nombre en blanco como si no estuviera', async () => {
		await rememberShareName('uuid-de-juan', '   ');
		expect(await shareNameOr('uuid-de-juan', 'Alguien')).toBe('Alguien');
	});

	// El nombre se guarda con los espacios de los costados sacados: quien lo
	// escribe en un campo de texto los deja sin darse cuenta, y después no
	// coincide con el mismo nombre escrito prolijo.
	it('guarda el nombre sin los espacios de los costados', async () => {
		await rememberShareName('uuid-de-juan', '  Juan  ');
		expect(await getShareName('uuid-de-juan')).toBe('Juan');
	});
});
