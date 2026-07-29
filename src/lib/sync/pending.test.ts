import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { createNote, softDeleteNote, updateNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import {
	grantUploadConsent,
	hasUploadConsent,
	listPendingUploads,
	markUploadedThrough,
	uploadedThrough
} from './pending';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('consent', () => {
	it('is off until the user gives it', async () => {
		expect(await hasUploadConsent()).toBe(false);

		await grantUploadConsent();

		expect(await hasUploadConsent()).toBe(true);
	});

	it('holds back everything while it is off, however much changed', async () => {
		const note = await createNote({ title: 'privada' });
		await createBlock({ noteId: note.id, content: 'texto' });

		expect(await listPendingUploads()).toEqual([]);
	});
});

describe('what is still pending', () => {
	it('lists every changed record once consent is given, oldest change first', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		const block = await createBlock({ noteId: note.id, content: 'texto' });

		const pending = await listPendingUploads();

		expect(pending.map((entry) => entry.table)).toEqual(['notes', 'blocks']);
		expect(pending.map((entry) => entry.row.id)).toEqual([note.id, block.id]);
		expect(pending[0].row.changeSeq).toBeLessThan(pending[1].row.changeSeq);
	});

	it('drops what was already uploaded and keeps what changed after', async () => {
		await grantUploadConsent();
		const old = await createNote({ title: 'vieja' });
		const uploaded = (await db.table('notes').get(old.id)).changeSeq;
		await markUploadedThrough(uploaded);

		expect(await listPendingUploads()).toEqual([]);

		await updateNote(old.id, { title: 'editada' });

		const pending = await listPendingUploads();
		expect(pending).toHaveLength(1);
		expect(pending[0].row.title).toBe('editada');
	});

	it('includes a deletion, so it can travel as a tombstone', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'se va' });
		await markUploadedThrough((await db.table('notes').get(note.id)).changeSeq);

		await softDeleteNote(note.id);

		const pending = await listPendingUploads();
		expect(pending.map((entry) => entry.row.id)).toContain(note.id);
		expect(pending.find((entry) => entry.row.id === note.id).row.deletedAt).not.toBe(null);
	});

	it('never moves the uploaded mark backwards', async () => {
		await markUploadedThrough(500);
		await markUploadedThrough(100);

		expect(await uploadedThrough()).toBe(500);
	});

	it('honours a batch size, taking the oldest changes first', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		for (const content of ['uno', 'dos', 'tres']) {
			await createBlock({ noteId: note.id, content });
		}

		const batch = await listPendingUploads({ limit: 2 });

		expect(batch).toHaveLength(2);
		expect(batch[0].table).toBe('notes');
		expect(batch[1].row.content).toBe('uno');
	});

	it('leaves the vault key and the preferences out of what travels', async () => {
		await grantUploadConsent();
		await createNote({ title: 'una' });

		const tables = new Set((await listPendingUploads()).map((entry) => entry.table));

		expect(tables.has('vault')).toBe(false);
		expect(tables.has('settings')).toBe(false);
	});
});
