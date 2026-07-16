import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, getNote } from './notes';
import { createBlock, getBlock } from './blocks';
import { JOURNAL_KEY, writeJournal, clearJournal, replayJournal } from './journal';

// The storage tests run under node, which has no localStorage; the journal
// only needs the Map-like subset.
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

beforeEach(async () => {
	store.clear();
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('pending-writes journal', () => {
	it('replays journaled note and block changes into the database and clears the journal', async () => {
		const note = await createNote({ title: 'vieja' });
		const block = await createBlock({ noteId: note.id, content: 'viejo' });
		writeJournal([
			{ table: 'notes', id: note.id, changes: { title: 'nueva' } },
			{ table: 'blocks', id: block.id, changes: { content: 'nuevo', html: 'nuevo' } }
		]);

		await replayJournal();

		expect((await getNote(note.id)).title).toBe('nueva');
		expect((await getBlock(block.id)).content).toBe('nuevo');
		expect(localStorage.getItem(JOURNAL_KEY)).toBe(null);
	});

	it('writes nothing for an empty entry list', () => {
		writeJournal([]);
		expect(localStorage.getItem(JOURNAL_KEY)).toBe(null);
	});

	it('survives a corrupt journal without touching data', async () => {
		const note = await createNote({ title: 'intacta' });
		localStorage.setItem(JOURNAL_KEY, 'esto no es JSON');

		await replayJournal();

		expect((await getNote(note.id)).title).toBe('intacta');
		expect(localStorage.getItem(JOURNAL_KEY)).toBe(null);
	});

	it('skips malformed entries and unknown tables', async () => {
		const note = await createNote({ title: 'vieja' });
		writeJournal([
			null,
			{ table: 'settings', id: 'x', changes: { hacked: true } },
			{ table: 'notes', id: note.id, changes: { title: 'nueva' } }
		]);

		await replayJournal();

		expect((await getNote(note.id)).title).toBe('nueva');
	});

	it('clearJournal removes a written journal', async () => {
		const note = await createNote({ title: 'vieja' });
		writeJournal([{ table: 'notes', id: note.id, changes: { title: 'nueva' } }]);
		clearJournal();

		await replayJournal();

		expect((await getNote(note.id)).title).toBe('vieja');
	});
});
