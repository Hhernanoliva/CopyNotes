import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, updateNote, getBlock, listActivityByBlock } from '$lib/storage';
import { listTasks } from '$lib/tasks';
import { ingestAgentChange } from './ingest';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('ingestAgentChange (untrusted agent input)', () => {
	it('rejects a change targeting a non-agent-visible note', async () => {
		const note = await createNote(); // agentVisible defaults to false
		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'x',
			agentId: 'agent'
		});
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-agent-visible');
		expect(await listTasks(note.id)).toHaveLength(0);
	});

	it('creates a task on a visible note and strips smuggled markup', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });

		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'Hola <img src=x onerror=alert(1)> mundo',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		const tasks = await listTasks(note.id);
		expect(tasks).toHaveLength(1);
		// The dangerous attribute/markup is gone; visible text survives.
		expect(tasks[0].html).not.toContain('onerror');
		expect(tasks[0].content).toContain('Hola');
		expect(tasks[0].content).toContain('mundo');
	});

	it('rejects a forbidden action type', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const res = await ingestAgentChange({ type: 'deleteTask', noteId: note.id, agentId: 'agent' });
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-allowed');
	});
});
