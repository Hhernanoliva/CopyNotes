import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, getNote, listNotes, softDeleteNote, updateNote } from './notes';
import { createBlock } from './blocks';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('notes repository', () => {
	it('creates a note with id, timestamps and no soft delete', async () => {
		const note = await createNote({ title: 'Ideas' });
		expect(note.id).toBeTruthy();
		expect(note.title).toBe('Ideas');
		expect(note.createdAt).toBe(note.updatedAt);
		expect(note.deletedAt).toBeNull();
	});

	it('reads a created note back', async () => {
		const note = await createNote({ title: 'Ideas' });
		const found = await getNote(note.id);
		expect(found).toEqual(note);
	});

	it('updates title and touches updatedAt', async () => {
		const note = await createNote({ title: 'Old' });
		const updated = await updateNote(note.id, { title: 'New' });
		expect(updated.title).toBe('New');
		expect(updated.createdAt).toBe(note.createdAt);
		expect(updated.updatedAt >= note.updatedAt).toBe(true);
	});

	it('soft delete hides the note from reads and lists but keeps the row', async () => {
		const note = await createNote({ title: 'Bye' });
		await softDeleteNote(note.id);

		expect(await getNote(note.id)).toBeUndefined();
		expect(await listNotes()).toEqual([]);

		const raw = await db.table('notes').get(note.id);
		expect(raw.deletedAt).toBeTruthy();
		expect(raw.title).toBe('Bye');
	});

	it('lists only active notes', async () => {
		const keep = await createNote({ title: 'Keep' });
		const drop = await createNote({ title: 'Drop' });
		await softDeleteNote(drop.id);

		const rows = await listNotes();
		expect(rows.map((note) => note.id)).toEqual([keep.id]);
	});

	it('soft delete cascades to the note blocks so they stop surfacing', async () => {
		const note = await createNote({ title: 'Bye' });
		const block = await createBlock({ noteId: note.id, content: 'x', dueDate: '2026-07-22' });

		await softDeleteNote(note.id);

		const raw = await db.table('blocks').get(block.id);
		expect(raw.deletedAt).toBeTruthy();
	});
});
