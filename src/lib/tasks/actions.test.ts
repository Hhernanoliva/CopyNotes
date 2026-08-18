import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, createNote, createBlock, getBlock, listActivityByBlock } from '$lib/storage';
import * as storage from '$lib/storage';
import {
	createTask,
	completeTask,
	redoTask,
	addTaskNote,
	readTask,
	listTasks,
	setTaskChecked,
	convertToTask
} from './actions';
import { isRedoRequested } from './redo';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('agent data signal', () => {
	it('bumps the agent-data signal on a task action', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const note = await createNote();
		const before = agentData.version;
		await createTask({ noteId: note.id, content: 'x', actor: 'user' });
		expect(agentData.version).toBeGreaterThan(before);
	});

	it('does not bump when the mutated block is missing', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const before = agentData.version;
		await completeTask({ blockId: 'nope', actor: 'agent' });
		expect(agentData.version).toBe(before);
	});

	it('does not bump the agent-data signal when addTaskNote targets a missing block', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const before = agentData.version;
		const res = await addTaskNote({ blockId: 'nope', actor: 'user', text: 'x' });
		expect(res).toBeUndefined();
		expect(agentData.version).toBe(before);
	});

	it('bumps on completeTask when the block exists (traceWrite success path)', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'x', actor: 'user' });
		const before = agentData.version;
		await completeTask({ blockId: block.id, actor: 'agent' });
		expect(agentData.version).toBeGreaterThan(before);
	});
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

	it('respects an explicit order and checked (editor insertion)', async () => {
		const note = await createNote();
		await createBlock({ noteId: note.id, content: 'primero' });
		const { block } = await createTask({ noteId: note.id, content: 'tarea', order: 0, checked: true });
		expect(block.order).toBe(0);
		expect(block.checked).toBe(true);
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

describe('completeTask cascade (agent path)', () => {
	it('completing a parent cascades to its todo children, summary on the parent line', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'Tareas' });
		const childA = await createBlock({ noteId: note.id, parentBlockId: parent.id, type: 'todo', content: 'a' });
		const childB = await createBlock({ noteId: note.id, parentBlockId: parent.id, type: 'todo', content: 'b' });

		const { block } = await completeTask({ blockId: parent.id, actor: 'agent', text: 'terminé todo' });

		expect(block.checked).toBe(true);
		expect((await getBlock(childA.id)).checked).toBe(true);
		expect((await getBlock(childB.id)).checked).toBe(true);
		// The agent's summary lands on the target's bitácora, children get an empty done line.
		expect((await listActivityByBlock(parent.id)).at(-1)).toMatchObject({ action: 'done', text: 'terminé todo' });
		expect((await listActivityByBlock(childA.id)).at(-1)).toMatchObject({ action: 'done', text: '' });
	});

	it('completing an already-done task still records the summary and never reopens it', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'ya hecha', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent', text: 'primera' });
		await completeTask({ blockId: block.id, actor: 'agent', text: 'segunda' });

		expect((await getBlock(block.id)).checked).toBe(true);
		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done', 'done']);
		expect(log.at(-1).text).toBe('segunda');
	});
});

describe('note / redo', () => {
	it('addTaskNote records an instruction without touching the task', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });

		await addTaskNote({ blockId: block.id, actor: 'agent', text: 'Listo, con fuentes' });

		expect((await getBlock(block.id)).checked).toBe(true);
		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done', 'note']);
		expect(log.at(-1).text).toBe('Listo, con fuentes');
	});

	it('redoTask unchecks AND leaves the instruction last, in one write', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });

		const { block: reopened } = await redoTask({
			blockId: block.id,
			actor: 'user',
			text: 'Rehacer: agregá fuentes'
		});
		expect(reopened.checked).toBe(false);

		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done', 'reopened', 'note']);
		expect(log.at(-1).text).toBe('Rehacer: agregá fuentes');
		// The agent's rule reads the LAST entry, so the order above is the contract.
		expect(isRedoRequested(reopened, log)).toBe(true);
	});

	it('redoTask writes nothing at all when the block is gone', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		expect(await redoTask({ blockId: 'nope', actor: 'user', text: 'x' })).toBeUndefined();
		// No orphan 'note' line landed on any block.
		expect((await listActivityByBlock(block.id)).map((e) => e.action)).toEqual(['created']);
	});

	// The whole point of redoTask: if the instruction cannot be written, the
	// untick must roll back too. Two separate writes leave the task reopened with
	// nothing explaining why — this fails the moment someone splits it again.
	it('redoTask rolls the untick back when the instruction cannot be written', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });

		const real = storage.appendActivity;
		const spy = vi.spyOn(storage, 'appendActivity').mockImplementation(async (entry) => {
			if (entry.action === 'note') throw new Error('disco lleno');
			return real(entry);
		});
		try {
			await expect(
				redoTask({ blockId: block.id, actor: 'user', text: 'Rehacer: agregá fuentes' })
			).rejects.toThrow('disco lleno');
		} finally {
			spy.mockRestore();
		}

		expect((await getBlock(block.id)).checked).toBe(true);
		expect((await listActivityByBlock(block.id)).map((e) => e.action)).toEqual(['created', 'done']);
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
		expect(await addTaskNote({ blockId: 'nope', actor: 'user', text: 'x' })).toBeUndefined();
		expect(await redoTask({ blockId: 'nope', actor: 'user', text: 'x' })).toBeUndefined();
	});

	it('readTask returns undefined for a nonexistent block', async () => {
		expect(await readTask('nope')).toBeUndefined();
	});
});

describe('atomicity', () => {
	it('does not append activity if the block write fails', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'T', actor: 'user' });
		const before = (await listActivityByBlock(block.id)).length;

		// Force the activity write to throw mid-transaction; the block change must roll back too.
		const activityTable = db.table('activity');
		const original = activityTable.add.bind(activityTable);
		// @ts-expect-error — monkey-patch de prueba: un Promise plano alcanza para forzar el fallo
		activityTable.add = () => Promise.reject(new Error('boom'));
		try {
			await expect(completeTask({ blockId: block.id, actor: 'agent' })).rejects.toThrow('boom');
		} finally {
			activityTable.add = original;
		}

		const reread = await getBlock(block.id);
		expect(reread.checked).toBe(false); // rolled back
		expect((await listActivityByBlock(block.id)).length).toBe(before); // no orphan entry
	});

	it('does not leave an orphan block if the activity write fails during createTask', async () => {
		const note = await createNote();
		const activityTable = db.table('activity');
		const original = activityTable.add.bind(activityTable);
		// @ts-expect-error — monkey-patch de prueba: un Promise plano alcanza para forzar el fallo
		activityTable.add = () => Promise.reject(new Error('boom'));
		try {
			await expect(createTask({ noteId: note.id, content: 'T', actor: 'user' })).rejects.toThrow('boom');
		} finally {
			activityTable.add = original;
		}
		// The whole createTask transaction rolled back → no orphan block in the note.
		expect(await listTasks(note.id)).toHaveLength(0);
	});
});

describe('setTaskChecked', () => {
	it('checks a parent, cascades to todo children, one done line each', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre' });
		const child = await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'hijo'
		});

		const plan = await setTaskChecked({ noteId: note.id, blockId: parent.id });

		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: parent.id, checked: true },
				{ id: child.id, checked: true }
			])
		);
		expect((await getBlock(parent.id)).checked).toBe(true);
		expect((await getBlock(child.id)).checked).toBe(true);
		expect((await listActivityByBlock(parent.id)).at(-1)).toMatchObject({ actor: 'user', action: 'done' });
		expect((await listActivityByBlock(child.id)).at(-1)).toMatchObject({ actor: 'user', action: 'done' });
	});

	it('unchecking the last checked child reopens the parent with a reopened line', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre', checked: true });
		const child = await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'hijo',
			checked: true
		});

		await setTaskChecked({ noteId: note.id, blockId: child.id });

		expect((await getBlock(parent.id)).checked).toBe(false);
		expect((await getBlock(child.id)).checked).toBe(false);
		expect((await listActivityByBlock(parent.id)).at(-1)).toMatchObject({ actor: 'user', action: 'reopened' });
	});

	it('returns null and writes nothing for a non-todo target', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'x' });
		const plan = await setTaskChecked({ noteId: note.id, blockId: block.id });
		expect(plan).toBeNull();
		expect(await listActivityByBlock(block.id)).toEqual([]);
	});

	it('is atomic: a mid-cascade write failure rolls back the whole cascade', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre' });
		const child = await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'hijo'
		});

		// Fail the activity write on the SECOND append, after the first block +
		// its line already applied inside the transaction. Atomicity must undo them.
		const activityTable = db.table('activity');
		const original = activityTable.add.bind(activityTable);
		let calls = 0;
		// @ts-expect-error — monkey-patch de prueba
		activityTable.add = (row) => {
			calls += 1;
			if (calls === 2) return Promise.reject(new Error('boom'));
			return original(row);
		};
		try {
			await expect(setTaskChecked({ noteId: note.id, blockId: parent.id })).rejects.toThrow('boom');
		} finally {
			activityTable.add = original;
		}

		// Nothing stuck: neither block flipped, no orphan bitácora line.
		expect((await getBlock(parent.id)).checked).toBe(false);
		expect((await getBlock(child.id)).checked).toBe(false);
		expect(await listActivityByBlock(parent.id)).toEqual([]);
		expect(await listActivityByBlock(child.id)).toEqual([]);
	});
});

// Spec 038 §5: el invitado de una nota compartida tilda igual, pero su renglón
// es un cache local —el servidor le rechaza cualquier fila que no sea bitácora—
// así que se escribe con la marca "esto no es un cambio local".
describe('setTaskChecked de un invitado', () => {
	async function tarea() {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'todo', content: 'llamar' });
		return { noteId: note.id, blockId: block.id };
	}

	it('tilda la tarea sin mover el sello de cambio', async () => {
		const { noteId, blockId } = await tarea();
		const antes = (await getBlock(blockId)).changeSeq;

		await setTaskChecked({ noteId, blockId, actor: 'member:u-1', fromCloud: true });

		const despues = await getBlock(blockId);
		expect(despues.checked).toBe(true);
		expect(despues.changeSeq).toBe(antes);
	});

	// La línea sí tiene que quedar pendiente: es lo ÚNICO suyo que puede viajar.
	it('su línea de bitácora queda pendiente y firmada como él', async () => {
		const { noteId, blockId } = await tarea();

		await setTaskChecked({ noteId, blockId, actor: 'member:u-1', fromCloud: true });

		const linea = (await listActivityByBlock(blockId)).at(-1);
		expect(linea).toMatchObject({ actor: 'member:u-1', action: 'done' });
		expect(linea.cloudSeq).toBeUndefined();
	});

	// El control: sin él, las dos de arriba pasarían aunque la marca no hiciera
	// nada, porque nadie comprueba que el camino del dueño siga siendo el de antes.
	it('y el tilde del dueño sigue moviendo el sello, como siempre', async () => {
		const { noteId, blockId } = await tarea();
		const antes = (await getBlock(blockId)).changeSeq;

		await setTaskChecked({ noteId, blockId });

		expect((await getBlock(blockId)).changeSeq).toBeGreaterThan(antes);
	});

	// La cascada de spec 003 escribe una línea por tarea afectada: la marca tiene
	// que valer para TODAS, no sólo para la que se tocó.
	it('la cascada entera entra con la marca', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre' });
		const child = await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'hijo'
		});
		const antes = (await getBlock(child.id)).changeSeq;

		await setTaskChecked({
			noteId: note.id,
			blockId: parent.id,
			actor: 'member:u-1',
			fromCloud: true
		});

		expect((await getBlock(child.id)).checked).toBe(true);
		expect((await getBlock(child.id)).changeSeq).toBe(antes);
		expect((await listActivityByBlock(child.id)).at(-1).actor).toBe('member:u-1');
	});
});

describe('convertToTask', () => {
	it('converts a text block to todo with a created line', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'comprar pan' });
		const result = await convertToTask({ blockId: block.id });
		expect(result.block.type).toBe('todo');
		expect(result.block.checked).toBe(false);
		expect(result.activity).toMatchObject({ actor: 'user', action: 'created', text: 'comprar pan' });
	});

	it('returns undefined for a missing block and does not bump', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const before = agentData.version;
		expect(await convertToTask({ blockId: 'nope' })).toBeUndefined();
		expect(agentData.version).toBe(before);
	});

	it('preserves an explicit checked (pasted "[x]" first line)', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'hecho' });
		const result = await convertToTask({ blockId: block.id, checked: true });
		expect(result.block.checked).toBe(true);
	});

	it('sets content and html in the same write when passed (paste first line)', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'viejo' });
		const result = await convertToTask({
			blockId: block.id,
			content: 'comprar leche',
			html: 'comprar leche'
		});
		expect(result.block.type).toBe('todo');
		expect(result.block.content).toBe('comprar leche');
		expect(result.activity.text).toBe('comprar leche');
	});
});
