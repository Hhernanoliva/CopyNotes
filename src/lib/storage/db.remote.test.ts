// The door for records that arrive from the cloud (spec 030 phase 3).
//
// Every write to a synced table is stamped with a fresh change counter, which is
// what makes "what is not uploaded yet" answerable. A record coming DOWN from
// the cloud is the one thing that must not be stamped: it is not a local change.
// Stamp it and it is uploaded again, downloaded by the other device, stamped
// there, and the two devices bounce it between them for ever.
//
// These are the first tests of phase 3 on purpose: everything else in the
// download path is harmless if this holds, and unfixable if it does not.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, putFromCloud } from './db';
import { createNote, updateNote } from './notes';
import { grantUploadConsent, listPendingUploads, markUploadedThrough } from '../sync/pending';

// Node has no localStorage and the counter mirrors its high-water mark there.
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

const remoteNote = (changeSeq, extra = {}) => ({
	id: 'nota-del-otro-dispositivo',
	title: 'Escrita en la otra máquina',
	sortOrder: 0,
	folderId: null,
	agentVisible: false,
	createdAt: '2026-07-30T10:00:00.000Z',
	updatedAt: '2026-07-30T10:00:00.000Z',
	deletedAt: null,
	changeSeq,
	...extra
});

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
});

describe('a record written from the cloud', () => {
	it('keeps the change counter it arrived with', async () => {
		await putFromCloud('notes', remoteNote(1_700_000_000_000));

		const stored = await db.table('notes').get('nota-del-otro-dispositivo');
		expect(stored.changeSeq).toBe(1_700_000_000_000);
	});

	it('is not queued to be uploaded back — the ping-pong this exists to prevent', async () => {
		await putFromCloud('notes', remoteNote(1_700_000_000_000));

		expect(await listPendingUploads()).toEqual([]);
	});

	it('leaves no bookkeeping field behind in the stored row', async () => {
		await putFromCloud('notes', remoteNote(1_700_000_000_000));

		const stored = await db.table('notes').get('nota-del-otro-dispositivo');
		expect(stored.fromCloud).toBeUndefined();
	});

	it('is not queued even when it updates a row that already existed here', async () => {
		await putFromCloud('notes', remoteNote(1_700_000_000_000));
		await markUploadedThrough(1_700_000_000_000);

		await putFromCloud('notes', remoteNote(1_700_000_000_001, { title: 'Editada allá' }));

		const stored = await db.table('notes').get('nota-del-otro-dispositivo');
		expect(stored.title).toBe('Editada allá');
		expect(stored.changeSeq).toBe(1_700_000_000_001);
		expect(await listPendingUploads()).toEqual([]);
	});
});

describe('the door stays shut for everything else', () => {
	it('still stamps a normal local write', async () => {
		const note = await createNote({ title: 'mía' });

		const pending = await listPendingUploads();
		expect(pending.map((entry) => entry.row.id)).toContain(note.id);
	});

	it('stamps a local edit of a record that came from the cloud, so it goes back up', async () => {
		await putFromCloud('notes', remoteNote(1_700_000_000_000));
		await markUploadedThrough(1_700_000_000_000);

		await updateNote('nota-del-otro-dispositivo', { title: 'la edité acá' });

		const pending = await listPendingUploads();
		expect(pending).toHaveLength(1);
		expect(pending[0].row.title).toBe('la edité acá');
	});
});
