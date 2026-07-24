import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, updateNote, getConnectedAgent, listActivityByBlock } from '$lib/storage';
import { createTask, listTasks, readTask } from '$lib/tasks';
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

	it('rejects reserved-name types that are not own handlers', async () => {
		for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
			const res = await ingestAgentChange({ type, noteId: 'whatever', agentId: 'agent' });
			expect(res).toEqual({ ok: false, reason: 'not-allowed' });
		}
	});

	it('rejects a completeTask whose blockId belongs to a hidden note, even with a visible noteId', async () => {
		const visible = await createNote();
		await updateNote(visible.id, { agentVisible: true });

		const hidden = await createNote();
		await updateNote(hidden.id, { agentVisible: true });
		const { block } = await createTask({ noteId: hidden.id, content: 'secreta', actor: 'user' });
		// user revokes visibility on the hidden note
		await updateNote(hidden.id, { agentVisible: false });

		const res = await ingestAgentChange({
			type: 'completeTask',
			noteId: visible.id, // agent lies: claims the still-visible note
			blockId: block.id, // but targets the now-hidden note's task
			agentId: 'agent'
		});

		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-agent-visible');
		// no write happened: task still unchecked, no `done` entry
		const read = await readTask(block.id);
		expect(read.block.checked).toBe(false);
		expect(read.activity.map((e) => e.action)).toEqual(['created']);
	});

	it('completes a task on a visible note and sanitizes the summary', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const { block } = await createTask({ noteId: note.id, content: 'tarea', actor: 'user' });

		const res = await ingestAgentChange({
			type: 'completeTask',
			noteId: note.id,
			blockId: block.id,
			text: 'listo <b>ok</b>',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		const read = await readTask(block.id);
		expect(read.block.checked).toBe(true);
		const done = read.activity.find((e) => e.action === 'done');
		expect(done.text).not.toContain('<b>'); // markup stripped to plain text
		expect(done.text).toContain('listo');
	});

	it('adds a bitácora note on a visible note', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const { block } = await createTask({ noteId: note.id, content: 'tarea', actor: 'user' });

		const res = await ingestAgentChange({
			type: 'addNote',
			noteId: note.id,
			blockId: block.id,
			text: 'nota del agente',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);
		const read = await readTask(block.id);
		expect(read.activity.at(-1).action).toBe('note');
		expect(read.activity.at(-1).text).toBe('nota del agente');
	});

	it('attributes agent writes to the stored agent identity, ignoring a spoofed actor', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });

		// A malicious file claims to be the user.
		const res = await ingestAgentChange({
			type: 'createTask', noteId: note.id, content: 'x', agentId: 'user'
		});
		expect(res.ok).toBe(true);

		const agent = await getConnectedAgent();
		const [task] = await listTasks(note.id);
		const log = await listActivityByBlock(task.id);
		expect(log[0].actor).toBe(agent.id);   // the real agent id
		expect(log[0].actor).not.toBe('user'); // never the spoofed value
	});
});
