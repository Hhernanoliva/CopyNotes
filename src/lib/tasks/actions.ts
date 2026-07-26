// The single place to create, edit, complete, reopen, and read TASKS (todo
// blocks). Both the app UI and the agent bridge call this layer; it wraps the
// block repositories and appends the matching activity (bitácora) entry, so
// there is never a second, divergent write path. It assumes its text/html
// inputs are already clean — the bridge runs untrusted agent input through the
// ingest gate BEFORE calling here (see src/lib/bridge/ingest.ts).

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

// Block change + its one bitácora entry commit together or not at all, so an
// action can never leave a task mutated without its trace (or vice versa).
async function traceWrite({ blockId, changes, actor, action, text }) {
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

export async function reopenTask({ blockId, actor = 'user', text = '' }) {
	return traceWrite({ blockId, changes: { checked: false }, actor, action: 'reopened', text });
}

// The UI's check/uncheck door. Applies the editor's cascade (specs/003: the
// toggled value flows down to todo children, ancestors mirror their children)
// writing ONE bitácora line per affected task — done or reopened by its final
// value. Returns the applied plan so the caller can update its in-memory rows,
// or null when the target is not a todo.
export async function setTaskChecked({ noteId, blockId, actor = 'user' }) {
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
			await updateBlock(id, { checked });
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

export async function editTask({ blockId, content, html = undefined, actor = 'user' }) {
	// When html is omitted, derive it from content (escaped) so a plain-text
	// edit can never smuggle markup into block.html.
	const changes = { content, html: html !== undefined ? html : plainTextToHtml(content) };
	return traceWrite({ blockId, changes, actor, action: 'edited', text: content });
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
