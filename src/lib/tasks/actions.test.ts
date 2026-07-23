import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, createBlock, getBlock, listActivityByBlock } from '$lib/storage';
import { createTask, completeTask, reopenTask, addTaskNote, editTask, readTask, listTasks } from './actions';

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

describe('readTask / listTasks', () => {
	it('readTask returns the block and its ordered bitácora', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'T', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });
		const read = await readTask(block.id);
		expect(read.block.id).toBe(block.id);
		expect(read.activity.map((e) => e.action)).toEqual(['created', 'done']);
	});

	it('listTasks returns only todo blocks of the note', async () => {
		const note = await createNote();
		await createTask({ noteId: note.id, content: 'una', actor: 'user' });
		await createBlock({ noteId: note.id, type: 'text', content: 'no soy tarea' });
		const tasks = await listTasks(note.id);
		expect(tasks.length).toBe(1);
		expect(tasks[0].type).toBe('todo');
	});
});

describe('mutators on a missing block', () => {
	it('return undefined instead of throwing when the block is gone', async () => {
		expect(await completeTask({ blockId: 'nope', actor: 'agent' })).toBeUndefined();
		expect(await reopenTask({ blockId: 'nope', actor: 'user' })).toBeUndefined();
		expect(await addTaskNote({ blockId: 'nope', actor: 'user', text: 'x' })).toBeUndefined();
		expect(await editTask({ blockId: 'nope', content: 'x', actor: 'agent' })).toBeUndefined();
	});

	it('readTask returns undefined for a nonexistent block', async () => {
		expect(await readTask('nope')).toBeUndefined();
	});
});
