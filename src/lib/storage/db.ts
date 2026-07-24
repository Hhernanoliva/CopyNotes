import Dexie from 'dexie';
import { htmlToPlainText, plainTextToHtml } from '$lib/format';

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
