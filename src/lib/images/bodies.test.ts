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

	it('NO es una tabla sincronizada, y eso es a propósito', () => {
		expect(SYNCED_TABLES).not.toContain('imageBodies');
	});

	it('hasBody no carga los bytes para contestar', async () => {
		expect(await hasBody(ID)).toBe(false);
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		expect(await hasBody(ID)).toBe(true);
	});
});
