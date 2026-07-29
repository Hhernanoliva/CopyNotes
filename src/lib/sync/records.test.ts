import { beforeAll, describe, expect, it } from 'vitest';
import { decryptRecord, encryptRecord } from './records';

let key;

beforeAll(async () => {
	key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]);
});

const block = {
	id: 'bloque-1',
	noteId: 'nota-1',
	parentBlockId: null,
	type: 'todo',
	content: 'Llamar al contador el martes',
	html: 'Llamar al <b>contador</b> el martes',
	note: 'comentario privado',
	dueDate: '2026-08-03',
	checked: false,
	order: 0,
	changeSeq: 1785362000000,
	createdAt: '2026-07-29T10:00:00.000Z',
	updatedAt: '2026-07-29T10:00:00.000Z',
	deletedAt: null
};

describe('record encryption', () => {
	it('round-trips a record through the vault key', async () => {
		const payload = await encryptRecord(key, 'blocks', block);
		const back = await decryptRecord(key, payload);

		expect(back).toEqual({ ...block, changeSeq: undefined });
	});

	// The acceptance criterion of spec 030: what is stored on the server must be
	// unreadable. Anything meaningful lives inside the blob.
	it('leaks no note content, no private comment and no relation in the clear', async () => {
		const payload = await encryptRecord(key, 'blocks', block);
		const onTheWire = JSON.stringify(payload);

		for (const secret of [
			'contador',
			'martes',
			'comentario privado',
			'todo',
			'2026-08-03',
			'nota-1'
		]) {
			expect(onTheWire).not.toContain(secret);
		}
	});

	it('keeps only id, table, version and the tombstone flag readable', async () => {
		const payload = await encryptRecord(key, 'blocks', block);

		expect(payload.id).toBe('bloque-1');
		expect(payload.table).toBe('blocks');
		expect(payload.changeSeq).toBe(1785362000000);
		expect(payload.deleted).toBe(false);
		expect(Object.keys(payload).sort()).toEqual(
			['blob', 'changeSeq', 'deleted', 'id', 'iv', 'table'].sort()
		);
	});

	it('marks a soft-deleted row as a tombstone in the clear', async () => {
		const payload = await encryptRecord(key, 'blocks', {
			...block,
			deletedAt: '2026-07-29T11:00:00.000Z'
		});

		expect(payload.deleted).toBe(true);
	});

	it('refuses a blob moved to another record or another table', async () => {
		const payload = await encryptRecord(key, 'blocks', block);

		await expect(decryptRecord(key, { ...payload, id: 'bloque-2' })).rejects.toThrow();
		await expect(decryptRecord(key, { ...payload, table: 'notes' })).rejects.toThrow();
	});

	it('refuses a tampered blob', async () => {
		const payload = await encryptRecord(key, 'blocks', block);
		const flipped = [...payload.blob];
		flipped[10] = flipped[10] === 'A' ? 'B' : 'A';

		await expect(decryptRecord(key, { ...payload, blob: flipped.join('') })).rejects.toThrow();
	});

	it('refuses another vault key', async () => {
		const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]);
		const payload = await encryptRecord(key, 'blocks', block);

		await expect(decryptRecord(other, payload)).rejects.toThrow();
	});

	it('never repeats the same blob for the same record', async () => {
		const first = await encryptRecord(key, 'blocks', block);
		const second = await encryptRecord(key, 'blocks', block);

		expect(first.blob).not.toBe(second.blob);
		expect(first.iv).not.toBe(second.iv);
	});
});
