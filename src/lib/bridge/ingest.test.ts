import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	db,
	createNote,
	updateNote,
	getConnectedAgent,
	getProcessedChange,
	listActivityByBlock,
	createBlock,
	getBlock,
	softDeleteBlock,
	updateBlock,
	setAgentsPaused
} from '$lib/storage';
import { createTask, listTasks, readTask } from '$lib/tasks';
import { grantUploadConsent, listPendingUploads } from '$lib/sync/pending';
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

	// The master switch (Configuración › Agentes → "Pausar agentes"): it must beat
	// agentVisible, or "pausado" would only mean "pausado para las notas que no
	// habías compartido igual".
	it('rejects every change while agents are paused, even on a visible note', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		await setAgentsPaused(true);

		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'x',
			agentId: 'agent'
		});
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('agents-paused');
		expect(await listTasks(note.id)).toHaveLength(0);

		// And resuming puts it back exactly as it was — no note had to be re-marked.
		await setAgentsPaused(false);
		const after = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'x',
			agentId: 'agent'
		});
		expect(after.ok).toBe(true);
	});

	// The pause is the one rejection that must NOT be archived in the dedupe
	// ledger: a request that timed out against a closed app keeps its id for 30 s,
	// so a resend right after resuming would otherwise replay the stale "paused"
	// answer with the agents already running.
	it('does not archive a paused rejection, so the same id works after resuming', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		await setAgentsPaused(true);

		const change = {
			id: 'mismo-pedido',
			type: 'createTask',
			noteId: note.id,
			content: 'Tarea que esperó',
			agentId: 'agent'
		};
		expect((await ingestAgentChange(change)).reason).toBe('agents-paused');
		expect(await getProcessedChange('mismo-pedido')).toBeUndefined();

		await setAgentsPaused(false);
		expect((await ingestAgentChange(change)).ok).toBe(true);
		expect(await listTasks(note.id)).toHaveLength(1);

		// Still idempotent afterwards: the applied change IS archived.
		expect((await ingestAgentChange(change)).ok).toBe(true);
		expect(await listTasks(note.id)).toHaveLength(1);
	});

	// Load-bearing for the "deleting a task needs no bitácora line" decision
	// (AGENT.md): the gate closes on a deleted task on its own, so an agent
	// holding its id can never act on it. If this ever passes, deletions DO need
	// to be recorded somewhere.
	it('rejects a change targeting a task the user deleted', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await softDeleteBlock(block.id);

		const res = await ingestAgentChange({
			type: 'completeTask',
			blockId: block.id,
			agentId: 'agent'
		});
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-agent-visible');
	});

	// `bridge/export.ts` discards a block's `note` (the user's private comment)
	// on the way OUT and says so in capitals. The way BACK skipped that lock: the
	// answer to a completeTask carried the whole block row, comment included,
	// straight into outbox/<id>.json on disk. The MCP server only ever reads
	// `result.block.id` — everything else was payload nobody asked for.
	it('never carries the private comment back out in a change result', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await updateBlock(block.id, { note: 'me lo debe Juan, no decirle al cliente' });

		const res = await ingestAgentChange({
			type: 'completeTask',
			blockId: block.id,
			agentId: 'agent'
		});

		expect(res.ok).toBe(true);
		expect(JSON.stringify(res)).not.toContain('Juan');
		// Still the one field the MCP server reads.
		expect(res.result.block.id).toBe(block.id);
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

	it('rejects completing a non-todo block', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const textBlock = await createBlock({ noteId: note.id, type: 'text', content: 'prosa' });

		const res = await ingestAgentChange({
			type: 'completeTask',
			noteId: note.id,
			blockId: textBlock.id,
			agentId: 'agent'
		});
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-a-task');
		expect((await getBlock(textBlock.id)).checked).toBe(false);
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

	it('is idempotent: the same change id applied twice yields one task and the same result', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const change = { id: 'chg-1', type: 'createTask', noteId: note.id, content: 'una' };

		const a = await ingestAgentChange(change);
		const b = await ingestAgentChange(change);
		expect(a.ok).toBe(true);
		expect(b).toEqual(a); // same result, not re-applied
		expect(await listTasks(note.id)).toHaveLength(1); // only one task created
	});

	it('serializes concurrent same-id deliveries: a retry fired mid-flight still applies once', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const change = { id: 'chg-race', type: 'createTask', noteId: note.id, content: 'una' };

		// Both fired WITHOUT awaiting the first — the canonical retry-in-flight
		// case. Without serialization both miss the dedupe check and apply.
		const [a, b] = await Promise.all([ingestAgentChange(change), ingestAgentChange(change)]);

		expect(await listTasks(note.id)).toHaveLength(1); // applied exactly once
		expect(a.ok).toBe(true);
		expect(b).toEqual(a); // second delivery sees the recorded result
	});

	// The ack protocol (src-tauri/src/bridge.rs) keeps an unconfirmed inbox file
	// and replays it on the next boot. That makes the gap between "task written"
	// and "id recorded" load-bearing: a crash inside it would apply the replay a
	// second time. Both must land in ONE transaction, or neither.
	it('rolls the task back when recording its id fails: no half-applied change', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });

		// One good ingest first, so the connected-agent row already exists: its
		// creation writes to `settings` too, and the spy below must only catch the
		// dedupe write.
		await ingestAgentChange({ id: 'ok-1', type: 'createTask', noteId: note.id, content: 'una' });
		expect(await listTasks(note.id)).toHaveLength(1);

		const settings = db.table('settings');
		const put = vi.spyOn(settings, 'put').mockImplementationOnce(() => {
			throw new Error('disco lleno');
		});

		const change = { id: 'chg-atomic', type: 'createTask', noteId: note.id, content: 'dos' };
		await expect(ingestAgentChange(change)).rejects.toThrow();

		// The whole transaction rolled back: no orphan task, and nothing recorded.
		expect(await listTasks(note.id)).toHaveLength(1);
		expect(await getProcessedChange('chg-atomic')).toBeUndefined();

		// And the retry the agent would send applies it exactly once.
		put.mockRestore();
		const retry = await ingestAgentChange(change);
		expect(retry.ok).toBe(true);
		expect(await listTasks(note.id)).toHaveLength(2);
	});

	it('records a rejection without opening a write transaction', async () => {
		const note = await createNote(); // agentVisible defaults to false
		const change = { id: 'chg-no', type: 'createTask', noteId: note.id, content: 'x' };

		const res = await ingestAgentChange(change);
		expect(res.ok).toBe(false);
		expect(await listTasks(note.id)).toHaveLength(0);
		expect(await getProcessedChange('chg-no')).toEqual(res); // still answered on redelivery
	});
});

// The seam between the two channels that were built in isolation: the agent
// (028) and encrypted sync (029/030). Nothing wires them together on purpose —
// agent writes land through the ordinary repositories, so `db.ts`'s per-table
// hooks stamp them like any keystroke. That is the whole mechanism, and its
// failure would be silent: the agent would keep working, the screen would look
// right, and nothing it wrote would ever reach the second device.
describe('agent writes and the cloud', () => {
	it('queues an agent-created task for upload like any local edit', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		await grantUploadConsent();

		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'tarea del agente',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		const [task] = await listTasks(note.id);
		const pending = await listPendingUploads();

		const block = pending.find((p) => p.table === 'blocks' && p.row.id === task.id);
		expect(block).toBeDefined();
		expect(block.row.changeSeq).toBeGreaterThan(0);
		// The bitácora entry is a synced record too: the history of who did what
		// has to travel, or the other device shows a task nobody created.
		expect(pending.some((p) => p.table === 'activity' && p.row.blockId === task.id)).toBe(true);
	});

	it('queues an agent completion, not just the creation', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const { block } = await createTask({ noteId: note.id, content: 'tarea', actor: 'user' });
		await grantUploadConsent();

		const before = (await listPendingUploads()).find(
			(p) => p.table === 'blocks' && p.row.id === block.id
		);

		const res = await ingestAgentChange({
			type: 'completeTask',
			noteId: note.id,
			blockId: block.id,
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		const after = (await listPendingUploads()).find(
			(p) => p.table === 'blocks' && p.row.id === block.id
		);
		expect(after.row.checked).toBe(true);
		// A fresh stamp, not the one the creation left: an edit on top of an
		// already-pending record still has to be recognised as newer.
		expect(after.row.changeSeq).toBeGreaterThan(before.row.changeSeq);
	});

	it('sends nothing the user has not consented to, whoever wrote it', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });

		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'tarea del agente',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		// Visible to the agent is not the same permission as visible to the cloud.
		expect(await listPendingUploads()).toEqual([]);
	});
});
