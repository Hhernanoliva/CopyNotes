import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, getBlock, listActivityByBlock } from '$lib/storage';
import { createTask } from './actions';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('createTask', () => {
	it('creates a todo block and one created activity entry', async () => {
		const note = await createNote();
		const { block, activity } = await createTask({
			noteId: note.id,
			content: 'Revisar el brief',
			actor: 'agent'
		});

		expect(block.type).toBe('todo');
		expect(block.checked).toBe(false);
		expect(block.createdBy).toBe('agent');
		expect((await getBlock(block.id)).content).toBe('Revisar el brief');

		expect(activity.action).toBe('created');
		expect(activity.actor).toBe('agent');
		const log = await listActivityByBlock(block.id);
		expect(log.length).toBe(1);
	});
});
