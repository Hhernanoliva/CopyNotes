import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, listNotes } from './notes';
import { createSnippet, listSnippets } from './snippets';
import { createTag, listTags } from './tags';
import { createFolder, deleteFolderKeepContents, listFolders, updateFolder } from './folders';
import { applySidebarUpdates, ensureSidebarOrder } from './organize';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('create at top', () => {
	// A new row takes a position BELOW the current lowest instead of renumbering
	// everything above it. Same visible order, but the siblings' rows are not
	// rewritten — and a row that is not rewritten is not re-uploaded to the cloud
	// (spec 030's deferred "stable positions"; see sync/upload.test.ts).
	it('new notes land on top without rewriting the notes already there', async () => {
		const first = await createNote({ title: 'primera' });
		const firstOrder = (await listNotes()).find((row) => row.id === first.id).sortOrder;

		const second = await createNote({ title: 'segunda' });

		const rows = await listNotes();
		expect(rows.map((row) => row.title)).toEqual(['segunda', 'primera']);
		expect(rows.find((row) => row.id === first.id).sortOrder).toBe(firstOrder);
		expect(rows.find((row) => row.id === second.id).sortOrder).toBeLessThan(firstOrder);
		expect(second.folderId).toBeNull();
		expect(first.id).not.toBe(second.id);
	});

	it('keeps landing on top however many notes there already are', async () => {
		for (const title of ['a', 'b', 'c', 'd']) await createNote({ title });
		expect((await listNotes()).map((row) => row.title)).toEqual(['d', 'c', 'b', 'a']);
	});

	it('a new note lands above note folders sharing the root, leaving them untouched', async () => {
		const folder = await createFolder('note', 'Trabajo');
		const folderOrder = (await listFolders('note'))[0].sortOrder;

		const note = await createNote({ title: 'nueva' });

		const folders = await listFolders('note');
		expect(folders[0].id).toBe(folder.id);
		expect(folders[0].sortOrder).toBe(folderOrder);
		const stored = (await listNotes()).find((row) => row.id === note.id);
		expect(stored.sortOrder).toBeLessThan(folderOrder);
	});

	it('snippets and tags do the same among themselves', async () => {
		await createSnippet({ name: 'uno', content: 'a' });
		await createSnippet({ name: 'dos', content: 'b' });
		await createTag({ name: 'zeta' });
		await createTag({ name: 'alfa' });
		expect((await listSnippets()).map((row) => row.name)).toEqual(['dos', 'uno']);
		// Manual order now beats the old alphabetical order.
		expect((await listTags()).map((row) => row.name)).toEqual(['alfa', 'zeta']);
	});
});

describe('applySidebarUpdates', () => {
	it('applies order changes in one shot', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		await applySidebarUpdates('notes', [
			{ id: a.id, sortOrder: 0 },
			{ id: b.id, sortOrder: 1 }
		]);
		expect((await listNotes()).map((row) => row.title)).toEqual(['a', 'b']);
	});
});

describe('folders', () => {
	it('deleteFolderKeepContents soft-deletes the folder and applies relocations', async () => {
		const folder = await createFolder('snippet', 'Clientes');
		const snippet = await createSnippet({ name: 's', content: 'x' });
		await applySidebarUpdates('snippets', [{ id: snippet.id, folderId: folder.id, sortOrder: 0 }]);
		await deleteFolderKeepContents(folder.id, {
			snippets: [{ id: snippet.id, folderId: null, sortOrder: 0 }]
		});
		expect(await listFolders('snippet')).toEqual([]);
		const rows = await listSnippets();
		expect(rows[0].folderId).toBeNull();
	});

	it('updateFolder persists collapse and name', async () => {
		const folder = await createFolder('note', 'Ideas');
		await updateFolder(folder.id, { collapsed: true, name: 'Ideas 2026' });
		const rows = await listFolders('note');
		expect(rows[0].collapsed).toBe(true);
		expect(rows[0].name).toBe('Ideas 2026');
	});
});

describe('ensureSidebarOrder', () => {
	it('leaves a healthy sidebar alone, gaps included', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		await db.table('notes').update(a.id, { sortOrder: 40 });
		await db.table('notes').update(b.id, { sortOrder: 10 });

		await ensureSidebarOrder();

		const rows = await listNotes();
		// Gaps are how "new note on top" avoids rewriting the list; closing them
		// would re-upload every row on each import.
		expect(rows.map((row) => [row.title, row.sortOrder])).toEqual([
			['b', 10],
			['a', 40]
		]);
	});

	it('repairs a container where two rows claim the same position', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		await db.table('notes').update(a.id, { sortOrder: 3 });
		await db.table('notes').update(b.id, { sortOrder: 3 });

		await ensureSidebarOrder();

		expect((await listNotes()).map((row) => row.sortOrder)).toEqual([0, 1]);
	});

	it('assigns missing sortOrders after the existing ones and closes gaps', async () => {
		const a = await createNote({ title: 'a' });
		const b = await createNote({ title: 'b' });
		// Simulate imported rows: one with a gapped order, one with none.
		await db.table('notes').update(a.id, { sortOrder: 7 });
		await db.table('notes').update(b.id, { sortOrder: undefined });
		await ensureSidebarOrder();
		const rows = await listNotes();
		expect(rows.map((row) => row.sortOrder)).toEqual([0, 1]);
		expect(rows[0].title).toBe('a');
	});
});
