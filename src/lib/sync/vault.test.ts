import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { dumpAllTables } from '../storage/backup';
import { createNote } from '../storage/notes';
import { encryptRecord, decryptRecord } from './records';
import {
	createVault,
	getVaultKey,
	hasVault,
	makePairingBlob,
	makeVaultProof,
	normalizePairingCode,
	openPairingBlob,
	proofOpens
} from './vault';
import { grantUploadConsent } from './pending';
import { setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	// No se puede crear una bóveda antes de permitir subir — la prueba del final
	// del primer bloque dice por qué. Todo lo demás es sobre qué hace la bóveda
	// una vez que existe legítimamente.
	await grantUploadConsent();
});

const PAIRING = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

describe('la llave de la bóveda', () => {
	it('empieza ausente y aparece al crearla, sin código que guardar', async () => {
		expect(await hasVault()).toBe(false);
		expect(await getVaultKey()).toBe(null);

		// Ya no devuelve nada que haya que anotar en ningún lado: esa es la spec 035
		// entera resumida en una línea.
		expect(await createVault()).toBe(undefined);

		expect(await hasVault()).toBe(true);
		expect(await getVaultKey()).not.toBe(null);
	});

	it('cifra un registro que sólo esta bóveda puede volver a leer', async () => {
		await createVault();
		const key = await getVaultKey();

		const payload = await encryptRecord(key, 'notes', {
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});

		expect(JSON.stringify(payload)).not.toContain('banco');
		expect(await decryptRecord(key, payload)).toEqual({
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});
	});

	it('se niega a existir antes del permiso para subir', async () => {
		// Las dos son una sola decisión, porque la mitad sin la otra es inútil y
		// dañina: una bóveda creada sin permiso nunca llega al servidor, y el
		// segundo aparato —al que le dicen que la cuenta no tiene bóveda— arma una
		// rival con otra llave. Desde ahí cada uno sube registros que el otro no
		// puede abrir.
		//
		// Local tampoco necesita nada: acá las notas están en claro (decisión D1).
		await setSetting(KEY.syncConsent, false);

		await expect(createVault()).rejects.toThrow(/permiso/i);
		expect(await hasVault()).toBe(false);
	});

	it('se niega a crear una segunda bóveda encima de la primera', async () => {
		await createVault();

		await expect(createVault()).rejects.toThrow();
	});

	it('queda afuera del respaldo JSON, que es texto plano', async () => {
		await createVault();
		await createNote({ title: 'una nota' });

		const dump = await dumpAllTables();

		expect(dump.vault).toBe(undefined);
	});
});

describe('la prueba que queda en el servidor', () => {
	it('la abre la llave que la hizo, y ninguna otra', async () => {
		await createVault();
		const proof = await makeVaultProof();

		expect(await proofOpens(proof)).toBe(true);

		// Otro aparato, otra llave: la misma prueba no abre. Es lo único que
		// distingue "esta bóveda es mía" de "otro aparato llegó primero", y el
		// servidor contesta igual en los dos casos (spec 035).
		await db.table('vault').clear();
		await createVault();

		expect(await proofOpens(proof)).toBe(false);
	});

	it('no lleva la llave ni el texto adentro', async () => {
		await createVault();
		const proof = await makeVaultProof();

		// Lo que viaja es un texto conocido, cifrado. Que ni el texto se lea es lo
		// que hace que la prueba no regale absolutamente nada.
		expect(JSON.stringify(proof)).not.toContain('copynotes');
	});

	it('sin bóveda no hay prueba que abrir', async () => {
		expect(await proofOpens({ iv: 'x', check_blob: 'y' })).toBe(false);
	});
});

describe('sumar un aparato con el código de paso', () => {
	it('la llave llega entera del otro lado', async () => {
		await createVault();
		const primera = await getVaultKey();
		const payload = await encryptRecord(primera, 'notes', {
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		const { code, blob } = await makePairingBlob();

		// El aparato nuevo: base vacía, más lo que el servidor tenía guardado.
		await db.table('vault').clear();
		expect(await hasVault()).toBe(false);

		const recibida = await openPairingBlob(code, blob);

		expect(await decryptRecord(recibida, payload)).toEqual({
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		expect(await hasVault()).toBe(true);
	});

	it('el aparato que se acaba de sumar puede sumar a un tercero', async () => {
		// Si la llave llegara sin permiso de envolverse, el segundo aparato sería
		// una vía muerta, y nadie se enteraría hasta el día que hiciera falta.
		await createVault();
		const { code, blob } = await makePairingBlob();
		await db.table('vault').clear();
		await openPairingBlob(code, blob);

		const segunda = await makePairingBlob();

		expect(segunda.code).toMatch(PAIRING);
	});

	it('el código es corto, legible en voz alta y con vencimiento', async () => {
		await createVault();

		const { code, expiresAt } = await makePairingBlob();

		// Dos grupos de cuatro, sin letras que se confundan con números.
		expect(code).toMatch(PAIRING);
		const faltan = new Date(expiresAt).getTime() - Date.now();
		expect(faltan).toBeGreaterThan(9 * 60_000);
		expect(faltan).toBeLessThanOrEqual(10 * 60_000);
	});

	it('rechaza un código equivocado y no guarda nada', async () => {
		await createVault();
		const { blob } = await makePairingBlob();
		await db.table('vault').clear();

		await expect(openPairingBlob('ZZZZ-ZZZZ', blob)).rejects.toThrow();
		expect(await hasVault()).toBe(false);
	});

	it('perdona cómo la persona escribió el código', async () => {
		await createVault();
		const { code, blob } = await makePairingBlob();
		await db.table('vault').clear();

		const desprolijo = code.toLowerCase().replace('-', ' ');

		expect(await openPairingBlob(desprolijo, blob)).not.toBe(null);
	});

	it('lee o/O como cero e i/l como uno, como copia la gente', () => {
		expect(normalizePairingCode('o0Il-1lo0')).toBe('00111100');
	});

	it('rechaza un código de otro largo o con letras que nunca usa', () => {
		expect(() => normalizePairingCode('ABCD')).toThrow();
		expect(() => normalizePairingCode('UUUU-UUUU')).toThrow();
	});

	it('cada código es distinto del anterior', async () => {
		await createVault();

		const uno = await makePairingBlob();
		const dos = await makePairingBlob();

		expect(uno.code).not.toBe(dos.code);
		expect(uno.blob.wrapped).not.toBe(dos.blob.wrapped);
	});

	it('sin bóveda no hay nada que pasarle a nadie', async () => {
		await expect(makePairingBlob()).rejects.toThrow(/todavía no tiene/i);
	});
});
