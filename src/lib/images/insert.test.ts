import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { listBodyIds } from './bodies';
import { insertImageBlock } from './insert';
import * as blocksModule from '../storage/blocks';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const SVG = new TextEncoder().encode('<svg></svg>');
const measures = async () => ({ width: 800, height: 600 });
const file = (bytes) => new File([bytes], 'image.png', { type: 'image/png' });

describe('insertar una captura', () => {
	beforeEach(async () => {
		await Promise.all([db.table('blocks').clear(), db.table('imageBodies').clear()]);
	});

	it('deja un bloque de tipo image y su cuerpo', async () => {
		const result = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		expect(result.status).toBe('ready');
		expect(result.block.type).toBe('image');
		expect(result.block.imageWidth).toBe(800);
		expect(result.block.content).toBe('');
		expect(await listBodyIds()).toEqual([result.block.imageId]);
	});

	it('la misma captura dos veces son dos bloques y UN cuerpo', async () => {
		const a = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		const b = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		expect(a.block.id).not.toBe(b.block.id);
		expect(a.block.imageId).toBe(b.block.imageId);
		expect(await listBodyIds()).toHaveLength(1);
	});

	it('un archivo rechazado no deja NI bloque ni cuerpo', async () => {
		const result = await insertImageBlock({ noteId: 'n1', file: file(SVG), measure: measures });
		expect(result.status).toBe('not-an-image');
		expect(await db.table('blocks').count()).toBe(0);
		expect(await listBodyIds()).toEqual([]);
	});

	it('si falla guardar los bytes, tampoco queda el bloque', async () => {
		const explota = { size: 16, arrayBuffer: async () => PNG.buffer, stream: null };
		const result = await insertImageBlock({
			noteId: 'n1',
			file: explota,
			measure: measures,
			saveBody: async () => { throw new Error('sin espacio'); }
		});
		expect(result.status).toBe('failed');
		expect(await db.table('blocks').count()).toBe(0);
	});

	it('si falla crear el bloque, tampoco queda huérfano', async () => {
		const spy = vi.spyOn(blocksModule, 'createBlock').mockRejectedValueOnce(new Error('Dexie full'));
		const result = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		expect(result.status).toBe('failed');
		expect(result.block).toBe(null);
		expect(await db.table('blocks').count()).toBe(0);
		spy.mockRestore();
	});
});
