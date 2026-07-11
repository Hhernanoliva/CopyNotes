import Dexie from 'dexie';

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
				if (block.html === undefined) block.html = block.content ?? '';
			});
	});
