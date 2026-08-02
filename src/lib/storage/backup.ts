// Storage side of export/import (specs/007 + 018). The full dump includes
// soft-deleted rows on purpose: the JSON backup is the safety net, and a
// restore should bring back exactly what was there. Both write paths run in
// one transaction so a failure leaves the database untouched.

import { db } from './db';
import { settlePendingWrites, trackPendingWrite } from './pending-writes';
import { normalizeSidebarOrder } from './organize';
import { LOCAL_ONLY_FIELDS } from '../export-import/schema';

// `activity` (the task bitácora) is part of the portable backup as of spec 030
// phase 0: it is user-visible history, and leaving it out meant every
// backup/restore round-trip silently erased it.
const TABLES = [
	'notes',
	'blocks',
	'snippets',
	'tags',
	'tagAssignments',
	'folders',
	'activity',
	'settings'
];

// The change counter (spec 030 phase 1) is per-device bookkeeping and never
// leaves through here: a row is re-stamped when it is written, so a counter
// inside a backup file could never match the restored row again — and the merge
// compares whole records, so it would read every row as a conflict and
// duplicate the whole database on a second import of the same file. This dump
// feeds both sides of that comparison (the file and the local rows), so
// dropping it here keeps them comparable. Later sync-only fields (`ownerId`)
// belong on this same list.
//
// `cloudSeq` (spec 030 phase 3) joins it for the same reason and one more: it
// says "the server already has this exact version". Restored onto another
// device, or after the row was edited, that claim is false — and a false claim
// there means a change that never uploads.
//
// The list itself lives in `export-import/schema.ts` (imported above), which is
// the gate that strips the same fields on the way back IN. Two copies would
// drift, and a field stripped on export but trusted on import is a hole — that
// is exactly what `fromCloud` was.

function withoutLocalOnlyFields(rows) {
	return rows.map((row) => {
		const copy = { ...row };
		for (const field of LOCAL_ONLY_FIELDS) delete copy[field];
		return copy;
	});
}

export async function dumpAllTables() {
	await settlePendingWrites();
	return db.transaction('r', TABLES, async () => {
		const entries = await Promise.all(
			TABLES.map(async (name) => [name, withoutLocalOnlyFields(await db.table(name).toArray())])
		);
		return Object.fromEntries(entries);
	});
}

export async function applyMergePlan(plan) {
	await settlePendingWrites();
	return trackPendingWrite(() =>
		db.transaction('rw', TABLES, async () => {
			for (const name of TABLES) {
				if (name === 'settings') continue;
				const rows = plan.inserts[name] ?? [];
				if (rows.length > 0) await db.table(name).bulkAdd(rows);
			}
			for (const setting of plan.settings) {
				await db.table('settings').put(setting);
			}
			await normalizeSidebarOrder();
		})
	);
}

// Caller must validate the incoming backup BEFORE calling this: once the
// transaction commits, the previous data is gone.
export async function replaceAllTables(data) {
	await settlePendingWrites();
	return trackPendingWrite(() =>
		db.transaction('rw', TABLES, async () => {
			for (const name of TABLES) {
				await db.table(name).clear();
				const rows = data[name] ?? [];
				if (rows.length > 0) await db.table(name).bulkPut(rows);
			}
			await normalizeSidebarOrder();
		})
	);
}
