// Storage side of sidebar organization (spec 022). The pure plans live in
// $lib/organize; this file applies their updates and keeps the shared root
// sequence (items + folders of one kind) consistent.

import { db } from './db';
import { now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { trackPendingWrite } from './pending-writes';

const KIND_ITEM_TABLE = { note: 'notes', snippet: 'snippets' };

export function applySidebarUpdates(tableName, updates) {
	if (!updates?.length) return Promise.resolve();
	return trackPendingWrite(async () => {
		const timestamp = now();
		await db.transaction('rw', db.table(tableName), async () => {
			for (const { id, ...changes } of updates) {
				await db.table(tableName).update(id, { ...changes, updatedAt: timestamp });
			}
		});
	});
}

// The position a row created "at the top" should take: one step below the
// lowest that exists. Orders are just numbers to sort by, so going down costs
// one write instead of renumbering the whole list upward — which is what this
// used to do, and it made a single new note re-upload every sibling to the
// cloud (a renumbered row is a changed row). Spec 030 calls this stable
// positions; sequential integers were the deliberate placeholder.
//
// The minimum is taken over every row of the tables sharing the kind's root
// sequence — including soft-deleted ones, and including rows filed inside a
// folder. Being more negative than strictly needed is free; colliding with an
// existing order is not, because equal orders sort by nothing in particular.
export function topSortOrder(kind) {
	const tableNames = kind === 'tag' ? ['tags'] : [KIND_ITEM_TABLE[kind], 'folders'];
	return db.transaction('r', tableNames.map((name) => db.table(name)), async () => {
		let lowest = 0;
		for (const name of tableNames) {
			// `orderBy` needs an index; sortOrder has none, so scan. These tables are
			// sidebar-sized (tens to hundreds of rows), and this runs once per
			// created note — not per keystroke.
			await db.table(name).each((row) => {
				if (typeof row.sortOrder === 'number' && row.sortOrder < lowest) lowest = row.sortOrder;
			});
		}
		return lowest - 1;
	});
}

// Safety net after backup imports, which may bring rows with no sortOrder at
// all (old backups) or two rows claiming the same one.
//
// It repairs only containers that cannot be ordered as they stand. Gaps are NOT
// a defect: creating at the top now takes a position below the lowest instead
// of renumbering the list, so a healthy sidebar is full of gaps. Closing them
// would undo that saving on every import and — worse — leave the restored rows
// different from the file they came from, which reads as a conflict the next
// time the same backup is imported.
export async function normalizeSidebarOrder() {
	const renumber = (rows) => {
		const orders = rows
			.map((row) => row.sortOrder)
			.filter((order) => typeof order === 'number' && Number.isFinite(order));
		const ambiguous = orders.length !== rows.length || new Set(orders).size !== orders.length;
		if (!ambiguous) return [];
		return sortBySidebarOrder(rows)
			.map((row, index) => ({ row, index }))
			.filter(({ row, index }) => row.sortOrder !== index);
	};

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
