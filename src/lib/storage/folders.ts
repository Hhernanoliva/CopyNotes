import { db } from './db';
import { createId, now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { shiftRootDown } from './organize';

const folders = db.table('folders');

export async function createFolder(kind, name) {
	await shiftRootDown(kind);
	const timestamp = now();
	const folder = {
		id: createId(),
		kind,
		name,
		sortOrder: 0,
		collapsed: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await folders.add(folder);
	return folder;
}

export async function listFolders(kind) {
	const rows = await folders.filter((folder) => !folder.deletedAt && folder.kind === kind).toArray();
	return sortBySidebarOrder(rows);
}

export async function updateFolder(id, changes) {
	await folders.update(id, { ...changes, updatedAt: now() });
	return folders.get(id);
}

// Soft-delete + relocation of the contents in one transaction so a crash
// can never leave items pointing at a dead folder without their new order.
// `updates` is { notes?: [...], snippets?: [...] } from planFolderDelete.
export async function deleteFolderKeepContents(id, updates) {
	const timestamp = now();
	const tableNames = ['folders', ...Object.keys(updates)];
	await db.transaction(
		'rw',
		tableNames.map((name) => db.table(name)),
		async () => {
			await folders.update(id, { deletedAt: timestamp, updatedAt: timestamp });
			for (const tableName of Object.keys(updates)) {
				for (const row of updates[tableName]) {
					const { id: rowId, ...changes } = row;
					await db.table(tableName).update(rowId, { ...changes, updatedAt: timestamp });
				}
			}
		}
	);
}
