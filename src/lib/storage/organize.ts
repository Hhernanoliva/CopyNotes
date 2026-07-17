// Storage side of sidebar organization (spec 022). The pure plans live in
// $lib/organize; this file applies their updates and keeps the shared root
// sequence (items + folders of one kind) consistent.

import { db } from './db';
import { now } from './ids';
import { sortBySidebarOrder } from '../organize';

const KIND_ITEM_TABLE = { note: 'notes', snippet: 'snippets' };

export async function applySidebarUpdates(tableName, updates) {
	if (!updates?.length) return;
	const timestamp = now();
	await db.transaction('rw', db.table(tableName), async () => {
		for (const { id, ...changes } of updates) {
			await db.table(tableName).update(id, { ...changes, updatedAt: timestamp });
		}
	});
}

// +1 on every live root row that shares the kind's root sequence. For notes
// and snippets that is the item table AND the folders of that kind; tags have
// no folders. Runs inside its own transaction; callers add the new row after.
export async function shiftRootDown(kind) {
	const itemTable = kind === 'tag' ? 'tags' : KIND_ITEM_TABLE[kind];
	const tables = kind === 'tag' ? [db.table('tags')] : [db.table(itemTable), db.table('folders')];
	await db.transaction('rw', tables, async () => {
		await db
			.table(itemTable)
			.filter((row) => !row.deletedAt && (kind === 'tag' || (row.folderId ?? null) === null))
			.modify((row) => {
				if (typeof row.sortOrder === 'number') row.sortOrder += 1;
			});
		if (kind !== 'tag') {
			await db
				.table('folders')
				.filter((row) => !row.deletedAt && row.kind === kind)
				.modify((row) => {
					if (typeof row.sortOrder === 'number') row.sortOrder += 1;
				});
		}
	});
}

// Renumber every container gapless, preserving the current visual order.
// Safety net after backup imports (which may bring gaps, duplicates or rows
// without sortOrder from old backups).
export async function ensureSidebarOrder() {
	const renumber = (rows) =>
		sortBySidebarOrder(rows)
			.map((row, index) => ({ row, index }))
			.filter(({ row, index }) => row.sortOrder !== index);

	for (const kind of ['note', 'snippet']) {
		const itemTable = KIND_ITEM_TABLE[kind];
		const [items, folders] = await Promise.all([
			db.table(itemTable).filter((row) => !row.deletedAt).toArray(),
			db.table('folders').filter((row) => !row.deletedAt && row.kind === kind).toArray()
		]);
		const folderIds = new Set(folders.map((folder) => folder.id));
		const rootItems = items.filter((item) => !item.folderId || !folderIds.has(item.folderId));
		const rootFolders = folders.map((folder) => ({ ...folder, __table: 'folders' }));
		const root = [...rootFolders, ...rootItems.map((item) => ({ ...item, __table: itemTable }))];
		for (const { row, index } of renumber(root)) {
			await db.table(row.__table).update(row.id, { sortOrder: index });
		}
		for (const folder of folders) {
			const contents = items.filter((item) => item.folderId === folder.id);
			for (const { row, index } of renumber(contents)) {
				await db.table(itemTable).update(row.id, { sortOrder: index });
			}
		}
	}
	const tags = await db.table('tags').filter((row) => !row.deletedAt).toArray();
	for (const { row, index } of renumber(tags)) {
		await db.table('tags').update(row.id, { sortOrder: index });
	}
}
