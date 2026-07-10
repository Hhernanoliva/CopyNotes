import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createBlock, softDeleteBlock } from './blocks';
import { createNote } from './notes';
import {
	createSnippet,
	getSnippet,
	listFavoriteSnippets,
	listSnippets,
	softDeleteSnippet,
	updateSnippet
} from './snippets';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('snippets repository', () => {
	it('creates an independent snippet from a block snapshot', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, content: 'reusable text' });
		const snippet = await createSnippet({
			name: 'Greeting',
			content: block.content,
			sourceNoteId: note.id,
			sourceBlockId: block.id
		});

		await softDeleteBlock(block.id);

		const survivor = await getSnippet(snippet.id);
		expect(survivor.content).toBe('reusable text');
		expect(survivor.sourceBlockId).toBe(block.id);
	});

	it('persists the structured block snapshot', async () => {
		const snapshot = {
			type: 'bullet',
			content: 'Padre',
			checked: false,
			children: [{ type: 'todo', content: 'Hijo', checked: true, children: [] }]
		};
		const snippet = await createSnippet({ name: 'Outline', content: '- Padre', blockSnapshot: snapshot });
		const stored = await getSnippet(snippet.id);
		expect(stored.blockSnapshot).toEqual(snapshot);
	});

	it('stores null blockSnapshot for text-only snippets', async () => {
		const snippet = await createSnippet({ name: 'Texto', content: 'hola' });
		const stored = await getSnippet(snippet.id);
		expect(stored.blockSnapshot).toBe(null);
	});

	it('updates snippet content', async () => {
		const snippet = await createSnippet({ name: 'A', content: 'old' });
		const updated = await updateSnippet(snippet.id, { content: 'new' });
		expect(updated.content).toBe('new');
	});

	it('filters favorites', async () => {
		await createSnippet({ name: 'plain' });
		const fav = await createSnippet({ name: 'starred', isFavorite: true });

		const favorites = await listFavoriteSnippets();
		expect(favorites.map((snippet) => snippet.id)).toEqual([fav.id]);
	});

	it('soft delete hides the snippet but keeps the row', async () => {
		const snippet = await createSnippet({ name: 'Bye' });
		await softDeleteSnippet(snippet.id);

		expect(await getSnippet(snippet.id)).toBeUndefined();
		expect(await listSnippets()).toEqual([]);

		const raw = await db.table('snippets').get(snippet.id);
		expect(raw.deletedAt).toBeTruthy();
	});
});
