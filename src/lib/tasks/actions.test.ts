import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, getBlock, listActivityByBlock } from '$lib/storage';
import { createTask, completeTask, reopenTask, addTaskNote, editTask } from './actions';

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

describe('completeTask', () => {
	it('checks the task and appends a done entry with actor and summary', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });

		const { block: done, activity } = await completeTask({
			blockId: block.id,
			actor: 'agent',
			text: 'Listo: enlace agregado'
		});

		expect(done.checked).toBe(true);
		expect(activity.action).toBe('done');
		expect(activity.actor).toBe('agent');
		expect(activity.text).toBe('Listo: enlace agregado');

		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done']);
	});
});

describe('reopen / note / edit', () => {
	it('reopen unchecks and traces; addTaskNote records an instruction', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });

		const { block: reopened } = await reopenTask({ blockId: block.id, actor: 'user' });
		expect(reopened.checked).toBe(false);

		await addTaskNote({ blockId: block.id, actor: 'user', text: 'Rehacer: agregá fuentes' });

		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done', 'reopened', 'note']);
		expect(log.at(-1).text).toBe('Rehacer: agregá fuentes');
	});

	it('editTask updates content and traces edited', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'viejo', actor: 'user' });
		const { block: edited, activity } = await editTask({
			blockId: block.id,
			content: 'nuevo',
			actor: 'agent'
		});
		expect(edited.content).toBe('nuevo');
		expect(activity.action).toBe('edited');
	});
});
