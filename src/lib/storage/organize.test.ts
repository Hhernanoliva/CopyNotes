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
	it('new notes land at sortOrder 0 and shift the rest', async () => {
		const first = await createNote({ title: 'primera' });
		const second = await createNote({ title: 'segunda' });
		const rows = await listNotes();
		expect(rows.map((row) => row.title)).toEqual(['segunda', 'primera']);
		expect(rows.map((row) => row.sortOrder)).toEqual([0, 1]);
		expect(second.folderId).toBeNull();
		expect(first.id).not.toBe(second.id);
	});

	it('a new note also shifts note folders sharing the root', async () => {
		const folder = await createFolder('note', 'Trabajo');
		await createNote({ title: 'nueva' });
		const folders = await listFolders('note');
		expect(folders[0].id).toBe(folder.id);
		expect(folders[0].sortOrder).toBe(1);
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
