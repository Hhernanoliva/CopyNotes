import Dexie from 'dexie';
import { htmlToPlainText, plainTextToHtml } from '$lib/format';
import { nextChangeSeq } from './change-seq';

// Schema strings only declare indexes; records can hold more fields.
// Soft-deleted rows stay in the tables and are filtered out by the repositories.
export const db = new Dexie('copynotes');

db.version(1).stores({
	notes: 'id, updatedAt',
	blocks: 'id, noteId, parentBlockId',
	snippets: 'id, updatedAt',
	tags: 'id, name',
	tagAssignments: 'id, tagId, [targetType+targetId]',
	settings: 'key'
});

db.version(2)
	.stores({
		notes: 'id, updatedAt',
		blocks: 'id, noteId, parentBlockId'
	})
	.upgrade(async (tx) => {
		await tx
			.table('blocks')
			.toCollection()
			.modify((block) => {
				if (block.html === undefined) block.html = plainTextToHtml(block.content ?? '');
			});
	});

// Before this version, the plain-text projection dropped <br> soft line
// breaks, so stored content disagrees with what the block shows. Recompute
// it once for every block whose html carries a <br>.
db.version(3).upgrade(async (tx) => {
	await tx
		.table('blocks')
		.toCollection()
		.modify((block) => {
			if (typeof block.html === 'string' && block.html.includes('<br')) {
				block.content = htmlToPlainText(block.html);
			}
		});
});

// v4 (spec 021): index dueDate so the Agenda lists dated blocks without a
// table scan. No upgrade body: blocks without a dueDate (or with null, not a
// valid IndexedDB key) simply stay out of the index.
db.version(4).stores({
	blocks: 'id, noteId, parentBlockId, dueDate'
});

// v5 (spec 022): manual sidebar order + folders. Every live note/snippet/tag
// gets an initial sortOrder matching the order the sidebar showed before
// (notes/snippets: updatedAt desc; tags: alphabetical); notes/snippets start
// at the root (folderId null). Deleted rows are ordered after the live ones
// so a future restore cannot collide with the live sequence.
db.version(5)
	.stores({
		folders: 'id, kind'
	})
	.upgrade(async (tx) => {
		const byRecency = (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
		const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '');
		const migrate = async (name, compare, withFolder) => {
			const rows = await tx.table(name).toArray();
			const live = rows.filter((row) => !row.deletedAt).sort(compare);
			const dead = rows.filter((row) => row.deletedAt).sort(compare);
			await Promise.all(
				[...live, ...dead].map((row, index) =>
					tx.table(name).update(row.id, {
						sortOrder: index,
						...(withFolder && row.folderId === undefined ? { folderId: null } : {})
					})
				)
			);
		};
		await migrate('notes', byRecency, true);
		await migrate('snippets', byRecency, true);
		await migrate('tags', byName, false);
	});

// v6 (spec 028): agent beta. New `activity` table — the per-task bitácora and
// the 012 "Agent Action History" entity, arriving early for the agent↔user
// channel. No upgrade body: the additive block field `createdBy` and note field
// `agentVisible` are read with a default in the repositories, so existing rows
// need no rewrite, and the activity table simply starts empty.
db.version(6).stores({
	activity: 'id, blockId, noteId, at'
});

// The tables a future sync uploads. `settings` is out: preferences stay
// last-write-wins keyed values (spec 002), not documents with a history.
export const SYNCED_TABLES = [
	'notes',
	'blocks',
	'snippets',
	'tags',
	'tagAssignments',
	'folders',
	'activity'
];

// v7 (spec 030 phase 1): index the change counter on every synced table, so
// "what changed since X" is an index range instead of a full scan. Existing
// rows are stamped in the upgrade — a row without the field is absent from the
// index, and would be invisible to the first upload.
db.version(7)
	.stores({
		notes: 'id, updatedAt, changeSeq',
		blocks: 'id, noteId, parentBlockId, dueDate, changeSeq',
		snippets: 'id, updatedAt, changeSeq',
		tags: 'id, name, changeSeq',
		tagAssignments: 'id, tagId, [targetType+targetId], changeSeq',
		folders: 'id, kind, changeSeq',
		activity: 'id, blockId, noteId, at, changeSeq'
	})
	.upgrade(async (tx) => {
		for (const name of SYNCED_TABLES) {
			await tx
				.table(name)
				.toCollection()
				.modify((row) => {
					row.changeSeq = nextChangeSeq();
				});
		}
	});

// v8 (spec 030 phase 2): the vault key. One row, device-local — it is neither a
// synced table nor part of the JSON backup (`storage/backup.ts` lists its
// tables explicitly), because the whole point is that the key never travels in
// the clear. See `sync/vault.ts` for what the row holds.
db.version(8).stores({
	vault: 'id'
});

// v9 (spec 030 phase 3): records that arrived from the cloud while this device
// had its own unsent version of them. Device-local like `vault`: not a synced
// table and not in `storage/backup.ts`'s list, because a pending decision on
// this machine means nothing on another one.
db.version(9).stores({
	conflicts: 'id, table, at'
});

// Every write to a synced table carries a change stamp. One hook per table
// instead of a stamp at each of the ~20 repository write sites: a write path
// added later cannot forget it, and a change sync never sees is a change lost.
// Covers add, bulkAdd, put, update, bulkPut and modify — verified against the
// real Dexie build, not assumed.
//
// The single exception is a record arriving FROM the cloud (spec 030 phase 3):
// it is not a local change. Stamping it would queue it for upload, the other
// device would download it, stamp it there, and the two would bounce the same
// record between them for ever. `putFromCloud` below is the only way in, and it
// marks the row with a transient `fromCloud` flag that these hooks consume.
//
// The flag is explicit rather than a "we are downloading right now" mode on
// purpose: a mode would span `await`s, and any ordinary save landing in that
// window would silently lose its stamp — which means losing the change.
for (const name of SYNCED_TABLES) {
	const table = db.table(name);
	table.hook('creating', (primaryKey, row) => {
		if (row.fromCloud) {
			delete row.fromCloud;
			return;
		}
		row.changeSeq = nextChangeSeq();
	});
	// Returning extra modifications is how the updating hook adds a field; a key
	// set to undefined is how Dexie deletes one.
	table.hook('updating', (modifications) =>
		Object.hasOwn(modifications, 'fromCloud')
			? { fromCloud: undefined }
			: { changeSeq: nextChangeSeq() }
	);
}

// Write a record exactly as the other device had it.
//
// `cloudSeq` records which version the server already holds. Without it the row
// would look pending the moment it lands (its counter is above this device's
// upload mark) and a fresh device would immediately re-upload everything it just
// downloaded. A later local edit re-stamps `changeSeq`, the two stop matching,
// and the record becomes pending again — which is exactly right.
export function putFromCloud(tableName, row) {
	return db.table(tableName).put({ ...row, cloudSeq: row.changeSeq, fromCloud: true });
}
