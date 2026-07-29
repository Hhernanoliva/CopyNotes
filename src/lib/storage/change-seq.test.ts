import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { nextChangeSeq } from './change-seq';
import { createNote, softDeleteNote, updateNote } from './notes';
import { applyInsertionPlan, createBlock, putBlock, softDeleteBlock, updateBlock } from './blocks';
import { createSnippet } from './snippets';
import { assignTag, createTag, renameTag } from './tags';
import { createFolder } from './folders';
import { appendActivity } from './activity';
import { applySidebarUpdates } from './organize';

// The storage tests run under node, which has no localStorage; the counter
// mirrors its high-water mark there, so it gets the same kind of stub the
// journal test uses. Nothing reads localStorage at import time, so installing
// it after the (hoisted) imports is fine.
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
	await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('change counter', () => {
	it('rises even when two writes fall in the same millisecond', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

		const first = nextChangeSeq();
		const second = nextChangeSeq();
		const third = nextChangeSeq();

		expect(second).toBeGreaterThan(first);
		expect(third).toBeGreaterThan(second);
	});

	it('never goes backwards when the system clock is moved back', () => {
		const clock = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
		const before = nextChangeSeq();

		clock.mockReturnValue(1_000);
		const after = nextChangeSeq();

		expect(after).toBeGreaterThan(before);
	});

	it('keeps rising after a restart, even with the clock moved back', async () => {
		const clock = vi.spyOn(Date, 'now').mockReturnValue(9_000_000);
		const before = nextChangeSeq();

		// A fresh module instance is what a restart looks like: the counter has
		// to recover its high-water mark from storage, not from the clock.
		vi.resetModules();
		clock.mockReturnValue(1_000);
		const restarted = await import('./change-seq');

		expect(restarted.nextChangeSeq()).toBeGreaterThan(before);
	});

	it('still rises when localStorage is unavailable', async () => {
		const saved = globalThis.localStorage;
		const blocked = () => {
			throw new Error('storage bloqueado');
		};
		globalThis.localStorage = {
			getItem: blocked,
			setItem: blocked,
			removeItem: blocked,
			clear: blocked,
			key: blocked,
			length: 0
		};
		vi.resetModules();

		try {
			const isolated = await import('./change-seq');
			const first = isolated.nextChangeSeq();
			expect(isolated.nextChangeSeq()).toBeGreaterThan(first);
		} finally {
			globalThis.localStorage = saved;
		}
	});
});

describe('every synced write is stamped', () => {
	it('stamps a create in every synced table', async () => {
		const note = await createNote({ title: 'nota' });
		const block = await createBlock({ noteId: note.id, content: 'texto' });
		const snippet = await createSnippet({ name: 'snip', blocks: [] });
		const tag = await createTag({ name: 'etiqueta' });
		const assignment = await assignTag(tag.id, 'note', note.id);
		const folder = await createFolder('note', 'carpeta');
		const entry = await appendActivity({
			blockId: block.id,
			noteId: note.id,
			actor: 'user',
			action: 'created'
		});

		const stamped = await Promise.all([
			db.table('notes').get(note.id),
			db.table('blocks').get(block.id),
			db.table('snippets').get(snippet.id),
			db.table('tags').get(tag.id),
			db.table('tagAssignments').get(assignment.id),
			db.table('folders').get(folder.id),
			db.table('activity').get(entry.id)
		]);

		for (const row of stamped) {
			expect(typeof row.changeSeq).toBe('number');
		}
		// Every stamp is unique, so no two changes are indistinguishable.
		expect(new Set(stamped.map((row) => row.changeSeq)).size).toBe(stamped.length);
	});

	it('raises the stamp on an edit, a rename and a soft delete', async () => {
		const note = await createNote({ title: 'antes' });
		const block = await createBlock({ noteId: note.id, content: 'antes' });
		const tag = await createTag({ name: 'antes' });
		const created = await db.table('blocks').get(block.id);

		await updateNote(note.id, { title: 'después' });
		await updateBlock(block.id, { content: 'después' });
		await renameTag(tag.id, 'después');
		await softDeleteBlock(block.id);

		const edited = await db.table('blocks').get(block.id);
		expect(edited.changeSeq).toBeGreaterThan(created.changeSeq);

		const noteRow = await db.table('notes').get(note.id);
		const tagRow = await db.table('tags').get(tag.id);
		expect(noteRow.changeSeq).toBeGreaterThan(created.changeSeq);
		expect(tagRow.changeSeq).toBeGreaterThan(created.changeSeq);
	});

	it('stamps the cascade when a note is deleted', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, content: 'hijo' });
		const before = (await db.table('blocks').get(block.id)).changeSeq;

		await softDeleteNote(note.id);

		const after = await db.table('blocks').get(block.id);
		expect(after.deletedAt).not.toBe(null);
		expect(after.changeSeq).toBeGreaterThan(before);
	});

	it('stamps bulk writes and sidebar reordering', async () => {
		const note = await createNote();
		const sibling = await createBlock({ noteId: note.id, content: 'vecino', order: 0 });
		const siblingBefore = (await db.table('blocks').get(sibling.id)).changeSeq;

		await applyInsertionPlan({
			newBlocks: [
				{
					id: 'insertado-1',
					noteId: note.id,
					parentBlockId: null,
					type: 'text',
					content: 'insertado',
					html: 'insertado',
					order: 0,
					collapsed: false,
					codeCollapsed: false,
					checked: false,
					note: '',
					dueDate: null
				}
			],
			updates: [{ id: sibling.id, order: 1 }]
		});

		const inserted = await db.table('blocks').get('insertado-1');
		const siblingAfter = await db.table('blocks').get(sibling.id);
		expect(typeof inserted.changeSeq).toBe('number');
		expect(siblingAfter.changeSeq).toBeGreaterThan(siblingBefore);

		const noteBefore = (await db.table('notes').get(note.id)).changeSeq;
		await applySidebarUpdates('notes', [{ id: note.id, changes: { sortOrder: 7 } }]);
		expect((await db.table('notes').get(note.id)).changeSeq).toBeGreaterThan(noteBefore);
	});

	it('re-stamps a restored block so an undo travels as a change', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, content: 'original' });
		const stored = await db.table('blocks').get(block.id);

		await putBlock({ ...stored, content: 'restaurado' });

		const restored = await db.table('blocks').get(block.id);
		expect(restored.changeSeq).toBeGreaterThan(stored.changeSeq);
	});

	it('lists what changed after a given stamp, tombstones included', async () => {
		const note = await createNote({ title: 'vieja' });
		const mark = nextChangeSeq();
		const fresh = await createNote({ title: 'nueva' });
		await softDeleteNote(note.id);

		const changed = await db.table('notes').where('changeSeq').above(mark).toArray();

		expect(changed.map((row) => row.id).sort()).toEqual([fresh.id, note.id].sort());
		expect(changed.find((row) => row.id === note.id).deletedAt).not.toBe(null);
	});
});
