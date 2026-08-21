import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SYNCED_TABLES } from '../storage/db';
import { clearBodies, clearUploadMarks, getBody, hasBody, listBodyIds, markBodyUploaded, putBody } from './bodies';

const ID = 'b'.repeat(64);
const bytes = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

describe('los cuerpos de las imágenes', () => {
	beforeEach(async () => {
		await db.table('imageBodies').clear();
	});

	it('un Blob sobrevive la ida y la vuelta por Dexie', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		const back = await getBody(ID);
		expect(back.type).toBe('image/png');
		expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
	});

	it('guardar dos veces la misma huella no duplica', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		expect(await listBodyIds()).toEqual([ID]);
	});

	it('la marca de subida se pone y se borra en masa', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		await markBodyUploaded(ID, 'cuenta-1');
		expect((await getBody(ID)).uploadedFor).toBe('cuenta-1');
		await clearUploadMarks();
		expect((await getBody(ID)).uploadedFor).toBe(null);
	});

	// `imageBodyRow` estampa `uploadedFor: null` y un `createdAt` nuevo cada vez,
	// y `putBody` hacía un `put` entero. Pegar dos veces la misma captura le
	// borraba la marca de "ya subida": hoy no la lee nadie, pero el día que la
	// parte B enchufe la subida es una subida repetida por cada pegado.
	//
	// El importador (`BackupDialog`) ya se había tenido que defender solo
	// filtrando contra `listBodyIds()`; el guardia va en la puerta única.
	it('volver a guardar la misma captura NO le borra la marca de subida', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		await markBodyUploaded(ID, 'cuenta-1');

		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });

		expect((await getBody(ID)).uploadedFor).toBe('cuenta-1');
	});

	it('ni le mueve la fecha en que entró', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		const nacimiento = (await getBody(ID)).createdAt;
		await db.table('imageBodies').update(ID, { createdAt: '2020-01-01T00:00:00.000Z' });

		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });

		expect((await getBody(ID)).createdAt).toBe('2020-01-01T00:00:00.000Z');
		expect((await getBody(ID)).createdAt).not.toBe(nacimiento);
	});

	it('NO es una tabla sincronizada, y eso es a propósito', () => {
		expect(SYNCED_TABLES).not.toContain('imageBodies');
	});

	it('hasBody no carga los bytes para contestar', async () => {
		expect(await hasBody(ID)).toBe(false);
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		expect(await hasBody(ID)).toBe(true);
	});
});
