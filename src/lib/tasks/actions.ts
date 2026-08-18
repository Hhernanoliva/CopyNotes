// The single place to create, complete, redo, and read TASKS (todo blocks).
// Both the app UI and the agent bridge call this layer; it wraps the block
// repositories and appends the matching activity (bitácora) entry, so there is
// never a second, divergent write path. It assumes its text/html inputs are
// already clean — the bridge runs untrusted agent input through the ingest gate
// BEFORE calling here (see src/lib/bridge/ingest.ts).
//
// What the bitácora records, ON PURPOSE, is births and closures: created, done,
// reopened, note. Writing a task's TEXT and DELETING it do NOT go through here
// and leave no line — text edits would add one per debounced save (pure noise;
// the guide promises they don't), and a deleted task is already unreachable for
// the agent because getBlock filters soft-deleted rows at the ingest gate. Do
// not "fix" this by routing block edits/deletes through a task layer; it is the
// decided shape (AGENT.md, spec 028).

import {
	db,
	createBlock,
	updateBlock,
	getBlock,
	listBlocksByNote,
	listChildBlocks,
	appendActivity,
	listActivityByBlock
} from '$lib/storage';
import { plainTextToHtml } from '$lib/format';
import { planToggleChecked, planSetChecked } from '$lib/blocks/cascade';
import { bumpAgentData } from '$lib/bridge/signal.svelte';

// Block change + its bitácora entry (or entries) commit together or not at all,
// so an action can never leave a task mutated without its trace (or vice versa).
// `note` adds a SECOND line, action 'note', inside the same transaction — the
// shape "Rehacer" needs (see redoTask).
async function traceWrite({ blockId, changes, actor, action, text, note = undefined }) {
	const result = await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await updateBlock(blockId, changes);
		if (!block) return undefined;
		const activity = await appendActivity({
			blockId,
			noteId: block.noteId,
			actor,
			action,
			text
		});
		// Appended AFTER the main line on purpose: isRedoRequested reads the LAST
		// entry, so the instruction has to be the one that ends up on top.
		if (note)
			await appendActivity({ blockId, noteId: block.noteId, actor, action: 'note', text: note });
		return { block, activity };
	});
	// updateBlock's safety-net bump already fired on a real write (and skipped a
	// missing block, which returns 0 rows), so there is no extra bump to do here.
	return result;
}

export async function createTask({
	noteId,
	parentBlockId = null,
	content = '',
	html = undefined,
	actor = 'user',
	order = undefined,
	checked = false
}) {
	// Resolve sibling order BEFORE the transaction when the caller didn't pass
	// one (the editor passes plan.order for in-position inserts; the agent omits
	// it → append). createBlock's order inference does chained reads that,
	// wrapped in trackPendingWrite's native promise, escape Dexie's transaction
	// zone and commit it early (PrematureCommitError). Passing order explicitly
	// leaves only direct, single-hop Dexie ops inside the transaction (no chained
	// Collection query), which is what makes nesting safe here.
	let resolvedOrder = order;
	if (resolvedOrder === undefined) {
		const siblings = await listChildBlocks(noteId, parentBlockId);
		resolvedOrder = siblings.length;
	}
	const result = await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await createBlock({
			noteId,
			parentBlockId,
			type: 'todo',
			content,
			html: html ?? plainTextToHtml(content),
			order: resolvedOrder,
			checked,
			createdBy: actor
		});
		const activity = await appendActivity({
			blockId: block.id,
			noteId,
			actor,
			action: 'created',
			text: content
		});
		return { block, activity };
	});
	// createBlock's safety-net bump (it always inserts) already refreshed the
	// agent export, so there is no extra bump to do here.
	return result;
}

// Completing a task cascades the SAME way the UI does (specs/003): the done
// value flows to todo children and mirrors up through todo ancestors, all in
// ONE atomic write. Without this the agent could tick a parent while its
// subtasks stayed open — the exact mismatch the UI never allows. The agent's
// summary lands on the target's bitácora line; cascaded blocks get an empty
// 'done' line, matching setTaskChecked.
export async function completeTask({ blockId, actor, text = '' }) {
	const block = await getBlock(blockId);
	if (!block) return undefined;
	const noteBlocks = await listBlocksByNote(block.noteId);
	const plan = planSetChecked(noteBlocks, blockId, true);
	if (!plan) return undefined; // not a todo (the ingest gate already guards this)

	const result = await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		let target;
		for (const { id, checked } of plan.updates) {
			const updated = await updateBlock(id, { checked });
			const activity = await appendActivity({
				blockId: id,
				noteId: block.noteId,
				actor,
				action: checked ? 'done' : 'reopened',
				text: id === blockId ? text : ''
			});
			if (id === blockId) target = { block: updated, activity };
		}
		// Target already done (nothing flipped for it): still record the agent's
		// completion intent + summary so an idempotent complete leaves a trace.
		if (!target) {
			const activity = await appendActivity({
				blockId,
				noteId: block.noteId,
				actor,
				action: 'done',
				text
			});
			target = { block, activity };
		}
		return target;
	});
	// updateBlock's safety-net bump fired on any real flip; when nothing flipped
	// (only the fallback activity line was written) refresh the export here.
	if (plan.updates.length === 0) bumpAgentData();
	return result;
}

// "Rehacer" (Configuración › Agentes): untick the task AND leave the user's
// instruction, in ONE write. Split in two it could reopen a task and then fail
// to record why, leaving the person with a task that reopened itself for no
// visible reason — and the agent with nothing to redo.
export async function redoTask({ blockId, actor = 'user', text }) {
	return traceWrite({
		blockId,
		changes: { checked: false },
		actor,
		action: 'reopened',
		text: '',
		note: text
	});
}

// The UI's check/uncheck door. Applies the editor's cascade (specs/003: the
// toggled value flows down to todo children, ancestors mirror their children)
// writing ONE bitácora line per affected task — done or reopened by its final
// value. Returns the applied plan so the caller can update its in-memory rows,
// or null when the target is not a todo.
//
// `actor` puede ser además `'member:<uuid>'` (spec 038 §6), y `fromCloud` dice
// que esta cuenta es MIEMBRO de la nota, no su dueña: su línea de bitácora es lo
// único suyo que puede viajar, y el renglón que se escribe al lado es un cache
// local. Sin la marca ese renglón queda `changedSinceCloud` para siempre —
// invisible para los dos contadores hoy, y subible a su propia bóveda el día que
// se salga de la compartición.
//
// El llamador resuelve el rol ANTES de llamar y lo pasa. No se puede preguntar
// acá adentro: `notes` no está en el alcance de la transacción, y una lectura
// encadenada la haría escapar de la zona de Dexie y cerrarla temprano
// (`PrematureCommitError`, el mismo que `createTask` documenta más arriba).
export async function setTaskChecked({ noteId, blockId, actor = 'user', fromCloud = false }) {
	const noteBlocks = await listBlocksByNote(noteId);
	const plan = planToggleChecked(noteBlocks, blockId);
	if (!plan) return null;
	// The whole cascade commits atomically: every affected task's checked flip
	// AND its bitácora line land together or not at all, so a mid-write failure
	// can never leave a half-toggled parent/child tree (or a task mutated
	// without its trace). All affected blocks belong to `noteId` (the cascade
	// walks only this note's blocks), so appendActivity's noteId is theirs too.
	// updateBlock's safety-net bump (inside) refreshes the export.
	await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		for (const { id, checked } of plan.updates) {
			// La marca vale para la cascada ENTERA, no sólo para la tarea que se tocó:
			// spec 003 escribe un renglón por tarea afectada y todos son cache igual.
			await updateBlock(id, fromCloud ? { checked, fromCloud: true } : { checked });
			await appendActivity({
				blockId: id,
				noteId,
				actor,
				action: checked ? 'done' : 'reopened',
				text: ''
			});
		}
	});
	return plan;
}

// The user's redo channel: an instruction line the agent can read. Stored as
// plain text on the activity row (never in block.html), rendered escaped.
export async function addTaskNote({ blockId, actor = 'user', text }) {
	const result = await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await getBlock(blockId);
		if (!block) return undefined;
		const activity = await appendActivity({
			blockId,
			noteId: block.noteId,
			actor,
			action: 'note',
			text
		});
		return { activity };
	});
	// The one action that writes ONLY an activity row (no block change), so the
	// storage safety net never fires — this explicit bump is what refreshes the
	// export when a redo instruction lands. Guarded: a missing block does not bump.
	if (result) bumpAgentData();
	return result;
}

// Converting an existing block INTO a todo (slash /todo, type menu, the reused
// first line of a paste). For the agent the task is born here → a 'created'
// line. An explicit `checked` wins (a pasted "[x]" line stays done); omitted,
// the block's previous checked survives — parity with planBlockType. `content`
// and `html` are optional: pass them to set the text in the SAME write (the
// paste case, which would otherwise need a separate updateBlock first).
export async function convertToTask({
	blockId,
	actor = 'user',
	checked = undefined,
	content = undefined,
	html = undefined
}) {
	const block = await getBlock(blockId);
	if (!block) return undefined;
	return traceWrite({
		blockId,
		changes: {
			type: 'todo',
			checked: checked ?? (block.checked ?? false),
			...(content !== undefined ? { content } : {}),
			...(html !== undefined ? { html } : {})
		},
		actor,
		action: 'created',
		text: content ?? block.content ?? ''
	});
}

export async function readTask(blockId) {
	const block = await getBlock(blockId);
	if (!block) return undefined;
	const activity = await listActivityByBlock(blockId);
	return { block, activity };
}

export async function listTasks(noteId) {
	const blocks = await listBlocksByNote(noteId);
	return blocks.filter((block) => block.type === 'todo');
}

// "Listo": una declaración sobre la NOTA, no sobre un renglón (spec 038 §8). No
// es una máquina de estados — no hay aprobación, no hay reapertura, no hay
// estado que consultar. El dueño la lee como una línea más.
//
// `blockId: null` no es una clave válida de IndexedDB, así que la fila queda
// fuera del índice `blockId` y se lee por nota. Eso es exactamente lo que se
// quiere, y está escrito porque parece un descuido.
//
// La palabra es castellana a propósito, contra el resto ('created', 'done',
// 'reopened', 'note'): `done` ya está tomada y significa "se tildó una tarea",
// que es otra cosa, y cualquier sinónimo inglés se confunde con ella al leer el
// código. 'listo' es literalmente lo que dice el botón.
//
// No abre transacción: es la única acción que escribe UNA fila y ninguna otra,
// así que no hay nada con qué quedar a medias. Por eso lleva el `bumpAgentData`
// explícito, igual que `addTaskNote`: sin escritura de renglón, la red de
// seguridad de `updateBlock` no se dispara.
export async function markNoteDone({ noteId, actor = 'user', text = '' }) {
	const activity = await appendActivity({ blockId: null, noteId, actor, action: 'listo', text });
	bumpAgentData();
	return { activity };
}
