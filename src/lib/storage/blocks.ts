import { db } from './db';
import { createId, now } from './ids';

const blocks = db.table('blocks');

export async function createBlock(fields) {
	const {
		noteId,
		parentBlockId = null,
		type = 'text',
		content = '',
		collapsed = false,
		checked = false,
		note = ''
	} = fields;
	let { order } = fields;
	if (order === undefined) {
		const siblings = await listChildBlocks(noteId, parentBlockId);
		order = siblings.length;
	}
	const timestamp = now();
	const block = {
		id: createId(),
		noteId,
		parentBlockId,
		type,
		content,
		order,
		collapsed,
		checked,
		note,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await blocks.add(block);
	return block;
}

export async function getBlock(id) {
	const block = await blocks.get(id);
	if (!block || block.deletedAt) return undefined;
	return block;
}

export async function listBlocksByNote(noteId) {
	const rows = await blocks
		.where('noteId')
		.equals(noteId)
		.filter((block) => !block.deletedAt)
		.toArray();
	return rows.sort((a, b) => a.order - b.order);
}

// Every live block across all notes, for search indexing.
export async function listAllBlocks() {
	const rows = await blocks.filter((block) => !block.deletedAt).toArray();
	return rows;
}

export async function listChildBlocks(noteId, parentBlockId) {
	const parent = parentBlockId ?? null;
	const rows = await listBlocksByNote(noteId);
	return rows.filter((block) => block.parentBlockId === parent);
}

export async function updateBlock(id, changes) {
	await blocks.update(id, { ...changes, updatedAt: now() });
	return blocks.get(id);
}

// Applies a snippet-insertion plan (new blocks + sibling order bumps) in one
// transaction so a mid-write failure cannot leave the note half-inserted.
export async function applyInsertionPlan(plan) {
	const timestamp = now();
	await db.transaction('rw', blocks, async () => {
		await blocks.bulkAdd(
			plan.newBlocks.map((block) => ({
				...block,
				createdAt: timestamp,
				updatedAt: timestamp,
				deletedAt: null
			}))
		);
		for (const update of plan.updates) {
			await blocks.update(update.id, { order: update.order, updatedAt: timestamp });
		}
	});
}

export async function softDeleteBlock(id) {
	const timestamp = now();
	await blocks.update(id, { deletedAt: timestamp, updatedAt: timestamp });
}
