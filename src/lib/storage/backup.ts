// Storage side of export/import (specs/007 + 018). The full dump includes
// soft-deleted rows on purpose: the JSON backup is the safety net, and a
// restore should bring back exactly what was there. Both write paths run in
// one transaction so a failure leaves the database untouched.

import { db } from './db';

const TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'folders', 'settings'];

export async function dumpAllTables() {
	const entries = await Promise.all(
		TABLES.map(async (name) => [name, await db.table(name).toArray()])
	);
	return Object.fromEntries(entries);
}

export async function applyMergePlan(plan) {
	await db.transaction('rw', TABLES, async () => {
		for (const name of TABLES) {
			if (name === 'settings') continue;
			const rows = plan.inserts[name] ?? [];
			if (rows.length > 0) await db.table(name).bulkAdd(rows);
		}
		for (const setting of plan.settings) {
			await db.table('settings').put(setting);
		}
	});
}

// Caller must validate the incoming backup BEFORE calling this: once the
// transaction commits, the previous data is gone.
export async function replaceAllTables(data) {
	await db.transaction('rw', TABLES, async () => {
		for (const name of TABLES) {
			await db.table(name).clear();
			const rows = data[name] ?? [];
			if (rows.length > 0) await db.table(name).bulkPut(rows);
		}
	});
}
