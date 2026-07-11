import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	applyInsertionPlan,
	createBlock,
	getBlock,
	listAllBlocks,
	listBlocksByNote,
	listChildBlocks,
	softDeleteBlock,
	softDeleteBlocks,
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

describe('applyInsertionPlan', () => {
	it('adds new blocks and bumps sibling orders in one step', async () => {
		const note = await createNote();
		const first = await createBlock({ noteId: note.id, content: 'primero', order: 0 });
		const second = await createBlock({ noteId: note.id, content: 'segundo', order: 1 });

		await applyInsertionPlan({
			newBlocks: [
				{
					id: 'nuevo-1',
					noteId: note.id,
					parentBlockId: null,
					type: 'text',
					content: 'insertado',
					order: 1,
					collapsed: false,
					checked: false
				}
			],
			updates: [{ id: second.id, order: 2 }]
		});

		const rows = await listBlocksByNote(note.id);
		expect(rows.map((block) => block.content)).toEqual(['primero', 'insertado', 'segundo']);
		const inserted = await getBlock('nuevo-1');
		expect(inserted.createdAt).toBeTruthy();
		expect(inserted.deletedAt).toBe(null);
		void first;
	});
});

describe('listAllBlocks', () => {
	it('returns live blocks across notes and hides soft-deleted ones', async () => {
		const noteA = await createNote();
		const noteB = await createNote();
		await createBlock({ noteId: noteA.id, content: 'a1' });
		const dead = await createBlock({ noteId: noteB.id, content: 'b1' });
		await softDeleteBlock(dead.id);

		const rows = await listAllBlocks();
		expect(rows.map((block) => block.content)).toEqual(['a1']);
	});
});

describe('softDeleteBlocks', () => {
	it('soft-deletes many blocks in one call', async () => {
		const note = await createNote();
		const a = await createBlock({ noteId: note.id, content: 'a' });
		const b = await createBlock({ noteId: note.id, content: 'b' });
		const c = await createBlock({ noteId: note.id, content: 'c' });

		await softDeleteBlocks([a.id, c.id]);

		const rows = await listBlocksByNote(note.id);
		expect(rows.map((block) => block.content)).toEqual(['b']);
		void b;
	});
});

describe('html field', () => {
	it('createBlock defaults html to its plain content', async () => {
		const block = await createBlock({ noteId: 'n1', content: 'hola' });
		const saved = await getBlock(block.id);
		expect(saved.html).toBe('hola');
	});

	it('createBlock keeps an explicit html value', async () => {
		const block = await createBlock({ noteId: 'n1', content: 'hola', html: '<strong>hola</strong>' });
		const saved = await getBlock(block.id);
		expect(saved.html).toBe('<strong>hola</strong>');
		expect(saved.content).toBe('hola');
	});
});
