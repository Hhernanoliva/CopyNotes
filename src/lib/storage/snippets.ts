import { db } from './db';
import { createId, now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { shiftRootDown } from './organize';

const snippets = db.table('snippets');

export async function createSnippet(fields) {
	const {
		name = '',
		content = '',
		blockSnapshot = null,
		sourceNoteId = null,
		sourceBlockId = null,
		isFavorite = false
	} = fields ?? {};
	await shiftRootDown('snippet');
	const timestamp = now();
	const snippet = {
		id: createId(),
		name,
		content,
		blockSnapshot,
		sourceNoteId,
		sourceBlockId,
		isFavorite,
		sortOrder: 0,
		folderId: null,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await snippets.add(snippet);
	return snippet;
}

export async function getSnippet(id) {
	const snippet = await snippets.get(id);
	if (!snippet || snippet.deletedAt) return undefined;
	return snippet;
}

export async function listSnippets() {
	const rows = await snippets.filter((snippet) => !snippet.deletedAt).toArray();
	return sortBySidebarOrder(rows);
}

export async function listFavoriteSnippets() {
	const rows = await listSnippets();
	return rows.filter((snippet) => snippet.isFavorite);
}

export async function updateSnippet(id, changes) {
	await snippets.update(id, { ...changes, updatedAt: now() });
	return snippets.get(id);
}

export async function softDeleteSnippet(id) {
	const timestamp = now();
	await snippets.update(id, { deletedAt: timestamp, updatedAt: timestamp });
}
