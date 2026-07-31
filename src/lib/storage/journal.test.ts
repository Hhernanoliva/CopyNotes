import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { createNote, getNote } from './notes';
import { createBlock, getBlock } from './blocks';
import {
	JOURNAL_KEY,
	SETTINGS_JOURNAL_KEY,
	writeJournal,
	clearJournal,
	replayJournal,
	journalSetting,
	unjournalSetting,
	journaledSetting
} from './journal';
import { getSetting, setSetting } from './settings';

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

	it('keeps the journal when replay fails so the next launch can retry', async () => {
		const note = await createNote({ title: 'vieja' });
		writeJournal([{ table: 'notes', id: note.id, changes: { title: 'nueva' } }]);
		const update = vi
			.spyOn(db.table('notes'), 'update')
			.mockRejectedValueOnce(new Error('storage unavailable'));

		await expect(replayJournal()).rejects.toThrow('storage unavailable');

		expect(localStorage.getItem(JOURNAL_KEY)).not.toBe(null);
		update.mockRestore();
	});

	it('clearJournal removes a written journal', async () => {
		const note = await createNote({ title: 'vieja' });
		writeJournal([{ table: 'notes', id: note.id, changes: { title: 'nueva' } }]);
		clearJournal();

		await replayJournal();

		expect((await getNote(note.id)).title).toBe('vieja');
	});
});

describe('preferences journal', () => {
	// A preference write that never commits stands in for the page dying inside
	// the write window: the browser discards an IndexedDB write started while
	// unloading, and settings are written straight through with no debounce.
	async function writeThatDies(key, value) {
		const put = vi
			.spyOn(db.table('settings'), 'put')
			.mockRejectedValueOnce(new Error('page died'));
		await expect(setSetting(key, value)).rejects.toThrow('page died');
		put.mockRestore();
	}

	it('replays a preference whose write never landed', async () => {
		await writeThatDies('theme', 'dark');
		expect(await db.table('settings').get('theme')).toBeUndefined();

		await replayJournal();

		expect((await db.table('settings').get('theme')).value).toBe('dark');
		expect(localStorage.getItem(SETTINGS_JOURNAL_KEY)).toBe(null);
	});

	it('reads back a preference whose write has not landed yet', async () => {
		await writeThatDies('theme', 'dark');

		// The layout reads the theme before boot replay runs, so the journal has
		// to answer for it.
		expect(await getSetting('theme')).toBe('dark');
	});

	it('leaves no journal behind once the write lands', async () => {
		await setSetting('theme', 'dark');
		expect(localStorage.getItem(SETTINGS_JOURNAL_KEY)).toBe(null);
	});

	it('keeps the newest change when an older write lands late', () => {
		journalSetting('theme', 'dark');
		journalSetting('theme', 'light');

		unjournalSetting('theme', 'dark');

		expect(journaledSetting('theme').value).toBe('light');
	});

	it('survives a corrupt preferences journal', async () => {
		localStorage.setItem(SETTINGS_JOURNAL_KEY, 'esto no es JSON');

		await replayJournal();

		expect(localStorage.getItem(SETTINGS_JOURNAL_KEY)).toBe(null);
	});
});
