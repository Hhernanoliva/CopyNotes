// The download half against a fake server (spec 030 phase 3). What is under test
// is the merge policy, one branch at a time: what comes down must never quietly
// replace something written here.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote, updateNote } from '../storage/notes';
import { encryptRecord } from './records';
import { createVault, getVaultKey } from './vault';
import { grantUploadConsent, listPendingUploads, markUploadedThrough } from './pending';

// Node has no localStorage and the change counter mirrors its high-water mark
// there.
const store = new Map();
globalThis.localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => {
		store.set(key, String(value));
	},
	removeItem: (key) => {
		store.delete(key);
	},
	clear: () => store.clear(),
	key: (index) => [...store.keys()][index] ?? null,
	get length() {
		return store.size;
	}
};

// What the fake server holds, newest last, plus an optional failure to inject.
const server = vi.hoisted(() => ({ rows: [], error: null }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		from: () => {
			// The real builder is a thenable; every chain in download.ts ends at
			// `.limit()`, so that is where this one resolves.
			let cursor = 0;
			const query = {
				select: () => query,
				gt: (_column, value) => {
					cursor = value;
					return query;
				},
				order: () => query,
				limit: async (max) =>
					server.error
						? { data: null, error: server.error }
						: { data: server.rows.filter((row) => row.server_seq > cursor).slice(0, max), error: null }
			};
			return query;
		}
	})
}));

const { downloadOnce, downloadedThrough } = await import('./download');

const note = (overrides) => ({
	id: 'nota-compartida',
	title: 'De la otra máquina',
	sortOrder: 0,
	folderId: null,
	agentVisible: false,
	createdAt: '2026-07-30T10:00:00.000Z',
	updatedAt: '2026-07-30T10:00:00.000Z',
	deletedAt: null,
	...overrides
});

// A row as the server stores it: encrypted with the real vault key, so these
// tests exercise the same path the app does.
async function publish(row, { table = 'notes', changeSeq, serverSeq }) {
	const payload = await encryptRecord(await getVaultKey(), table, { ...row, changeSeq });
	server.rows.push({
		table_name: payload.table,
		id: payload.id,
		change_seq: payload.changeSeq,
		deleted: payload.deleted,
		iv: payload.iv,
		blob: payload.blob,
		server_seq: serverSeq
	});
}

beforeEach(async () => {
	server.rows = [];
	server.error = null;
	await Promise.all(db.tables.map((table) => table.clear()));
	await createVault();
	await grantUploadConsent();
});

describe('what arrives from the other device', () => {
	it('lands here, and does not bounce straight back up', async () => {
		await publish(note({ title: 'Escrita allá' }), { changeSeq: 1_700_000_000_000, serverSeq: 1 });

		const result = await downloadOnce();

		expect(result.applied).toBe(1);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('Escrita allá');
		expect(await listPendingUploads()).toEqual([]);
		expect(await downloadedThrough()).toBe(1);
	});

	it('deletes here what was deleted there', async () => {
		await publish(note({ deletedAt: null }), { changeSeq: 1_700_000_000_000, serverSeq: 1 });
		await downloadOnce();

		await publish(note({ deletedAt: '2026-07-30T11:00:00.000Z' }), {
			changeSeq: 1_700_000_000_001,
			serverSeq: 2
		});
		await downloadOnce();

		expect((await db.table('notes').get('nota-compartida')).deletedAt).toBe(
			'2026-07-30T11:00:00.000Z'
		);
	});

	it('ignores the echo of what this device just uploaded', async () => {
		const mine = await createNote({ title: 'mía' });
		const stored = await db.table('notes').get(mine.id);
		await markUploadedThrough(stored.changeSeq);
		await publish(stored, { changeSeq: stored.changeSeq, serverSeq: 1 });

		const result = await downloadOnce();

		expect(result.applied).toBe(0);
		expect((await db.table('notes').get(mine.id)).title).toBe('mía');
	});

	it('ignores a version older than the one already here', async () => {
		await publish(note({ title: 'nueva' }), { changeSeq: 1_700_000_000_010, serverSeq: 1 });
		await downloadOnce();

		await publish(note({ title: 'vieja' }), { changeSeq: 1_700_000_000_005, serverSeq: 2 });
		const result = await downloadOnce();

		expect(result.applied).toBe(0);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('nueva');
	});
});

describe('when both devices touched the same record', () => {
	it('keeps what is written here and counts a conflict instead of overwriting', async () => {
		await publish(note({ title: 'versión de allá' }), {
			changeSeq: 1_700_000_000_000,
			serverSeq: 1
		});
		await downloadOnce();
		// Edited here and not uploaded yet.
		await updateNote('nota-compartida', { title: 'versión mía sin subir' });

		await publish(note({ title: 'versión de allá, más nueva' }), {
			changeSeq: 1_900_000_000_000,
			serverSeq: 2
		});
		const result = await downloadOnce();

		expect(result.conflicts).toBe(1);
		expect(result.applied).toBe(0);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('versión mía sin subir');
		// And the local edit is still on its way up: a conflict blocks nothing.
		expect(await listPendingUploads()).toHaveLength(1);
	});
});

describe('when the server or the network fails', () => {
	it('leaves the cursor where it was, so the batch is read again', async () => {
		await publish(note({}), { changeSeq: 1_700_000_000_000, serverSeq: 7 });
		server.error = { message: 'No hay conexión' };

		await expect(downloadOnce()).rejects.toThrow('No hay conexión');
		expect(await downloadedThrough()).toBe(0);

		server.error = null;
		const result = await downloadOnce();
		expect(result.applied).toBe(1);
		expect(await downloadedThrough()).toBe(7);
	});

	it('applying the same batch twice writes the same thing, not two things', async () => {
		await publish(note({ title: 'una sola vez' }), {
			changeSeq: 1_700_000_000_000,
			serverSeq: 1
		});

		await downloadOnce();
		// Rewind as if the mark had never been saved.
		await db.table('settings').put({ key: 'syncDownloadedThrough', value: 0 });
		await downloadOnce();

		expect(await db.table('notes').count()).toBe(1);
		expect(await listPendingUploads()).toEqual([]);
	});
});
