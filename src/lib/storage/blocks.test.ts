import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	createBlock,
	getBlock,
	listBlocksByNote,
	listChildBlocks,
	softDeleteBlock,
	updateBlock
} from './blocks';
import { createNote } from './notes';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('blocks repository', () => {
	it('creates a block with defaults and auto order', async () => {
		const note = await createNote();
		const first = await createBlock({ noteId: note.id, content: 'one' });
		const second = await createBlock({ noteId: note.id, content: 'two' });

		expect(first.type).toBe('text');
		expect(first.order).toBe(0);
		expect(second.order).toBe(1);
		expect(first.collapsed).toBe(false);
		expect(first.checked).toBe(false);
	});

	it('keeps parent-child relationships for nested blocks', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'bullet', content: 'parent' });
		const child = await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'bullet',
			content: 'child'
		});

		const roots = await listChildBlocks(note.id, null);
		const children = await listChildBlocks(note.id, parent.id);

		expect(roots.map((block) => block.id)).toEqual([parent.id]);
		expect(children.map((block) => block.id)).toEqual([child.id]);
		expect(child.noteId).toBe(note.id);
	});

	it('reorders siblings through order updates', async () => {
		const note = await createNote();
		const a = await createBlock({ noteId: note.id, content: 'a' });
		const b = await createBlock({ noteId: note.id, content: 'b' });

		await updateBlock(a.id, { order: 1 });
		await updateBlock(b.id, { order: 0 });

		const rows = await listBlocksByNote(note.id);
		expect(rows.map((block) => block.content)).toEqual(['b', 'a']);
	});

	it('updates todo checked state', async () => {
		const note = await createNote();
		const todo = await createBlock({ noteId: note.id, type: 'todo', content: 'do it' });
		const checked = await updateBlock(todo.id, { checked: true });
		expect(checked.checked).toBe(true);
	});

	it('soft delete hides the block but keeps children and the row', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'bullet' });
		const child = await createBlock({ noteId: note.id, parentBlockId: parent.id });

		await softDeleteBlock(parent.id);

		expect(await getBlock(parent.id)).toBeUndefined();
		expect(await getBlock(child.id)).toBeTruthy();

		const raw = await db.table('blocks').get(parent.id);
		expect(raw.deletedAt).toBeTruthy();
	});
});
