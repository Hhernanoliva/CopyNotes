import { db } from './db';
import { createId, now } from './ids';
import { plainTextToHtml } from '$lib/format';
import { trackPendingWrite } from './pending-writes';
import { planToggleChecked } from '$lib/blocks/cascade';
import { bumpAgentData } from '$lib/bridge/signal.svelte';

const blocks = db.table('blocks');

// Safety net (spec 2026-07-24 puerta única): every write in this repo bumps
// the agent-data signal AFTER the Dexie write resolves, so export.json can
// never go stale regardless of which code path wrote. Reads never bump.

export function createBlock(fields) {
	return trackPendingWrite(async () => {
		const {
			noteId,
			parentBlockId = null,
			type = 'text',
			content = '',
			html,
			collapsed = false,
			codeCollapsed = false,
			checked = false,
			note = '',
			dueDate = null,
			createdBy = 'user'
		} = fields;
		let { order } = fields;
		if (order === undefined) {
			const siblings = await listChildBlocks(noteId, parentBlockId);
			order = siblings.length;
		}
		const timestamp = now();
		const block = {
			id: createId(),
			noteId,
			parentBlockId,
			type,
			content,
			html: html ?? plainTextToHtml(content),
			order,
			collapsed,
			codeCollapsed,
			checked,
			note,
			dueDate,
			createdBy,
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null
		};
		await blocks.add(block);
		bumpAgentData();
		return block;
	});
}

// Upsert a full block row by its id. Used by undo/redo to restore a block
// exactly as it was (including a re-create of a soft-deleted one), which
// createBlock cannot do because it always mints a fresh id.
export function putBlock(block) {
	return trackPendingWrite(async () => {
		const key = await blocks.put(block);
		bumpAgentData();
		return key;
	});
}

export async function getBlock(id) {
	const block = await blocks.get(id);
	if (!block || block.deletedAt) return undefined;
	return block;
}

export async function listBlocksByNote(noteId) {
	const rows = await blocks
		.where('noteId')
		.equals(noteId)
		.filter((block) => !block.deletedAt)
		.toArray();
	return rows.sort((a, b) => a.order - b.order);
}

// The ids of every note that is still live. Used to keep cross-note block
// queries from returning orphans — blocks whose note was deleted without
// cascading (legacy data from before softDeleteNote cascaded), which would
// otherwise resurface as ghosts in Search and Agenda.
async function liveNoteIds() {
	const notes = await db
		.table('notes')
		.filter((note) => !note.deletedAt)
		.toArray();
	return new Set(notes.map((note) => note.id));
}

// Every live block across all notes, for search indexing.
export async function listAllBlocks() {
	const live = await liveNoteIds();
	return blocks.filter((block) => !block.deletedAt && live.has(block.noteId)).toArray();
}

export async function listChildBlocks(noteId, parentBlockId) {
	const parent = parentBlockId ?? null;
	const rows = await listBlocksByNote(noteId);
	return rows.filter((block) => block.parentBlockId === parent);
}

export function updateBlock(id, changes) {
	return trackPendingWrite(async () => {
		// .update resolves to the count of rows changed (0 for a missing id). Only
		// bump on a real write, so a no-op update never announces nothing — this
		// is what keeps the task layer's "missing block does not bump" invariant.
		const updated = await blocks.update(id, { ...changes, updatedAt: now() });
		if (updated) bumpAgentData();
		return blocks.get(id);
	});
}

// Toggle a todo's checked state applying the same parent/child cascade the
// editor uses (specs/003). Callers like Agenda only hold the dated blocks, so
// this loads the full note first — the cascade needs every ancestor and sibling
// to decide the final state. Returns the applied plan, or null when the target
// is not a todo.
export async function toggleTodoCascade(noteId, blockId) {
	const noteBlocks = await listBlocksByNote(noteId);
	const plan = planToggleChecked(noteBlocks, blockId);
	if (!plan) return null;
	for (const { id, ...changes } of plan.updates) {
		await updateBlock(id, changes);
	}
	return plan;
}

// Applies a snippet-insertion plan (new blocks + sibling order bumps) in one
// transaction so a mid-write failure cannot leave the note half-inserted.
export function applyInsertionPlan(plan) {
	return trackPendingWrite(async () => {
		const timestamp = now();
		await db.transaction('rw', blocks, async () => {
			await blocks.bulkAdd(
				plan.newBlocks.map((block) => ({
					...block,
					createdAt: timestamp,
					updatedAt: timestamp,
					deletedAt: null
				}))
			);
			for (const update of plan.updates) {
				await blocks.update(update.id, { order: update.order, updatedAt: timestamp });
			}
		});
		bumpAgentData();
	});
}

export function softDeleteBlock(id) {
	return trackPendingWrite(async () => {
		const timestamp = now();
		const updated = await blocks.update(id, { deletedAt: timestamp, updatedAt: timestamp });
		if (updated) bumpAgentData();
	});
}

// Soft-delete many blocks at once (multi-block selection). One transaction so
// a group delete can't half-apply.
export function softDeleteBlocks(ids) {
	return trackPendingWrite(async () => {
		const timestamp = now();
		let changed = 0;
		await db.transaction('rw', blocks, async () => {
			for (const id of ids) {
				changed += await blocks.update(id, { deletedAt: timestamp, updatedAt: timestamp });
			}
		});
		if (changed) bumpAgentData();
	});
}

// Every live block carrying a dueDate, ascending by date — the Agenda query.
// orderBy walks the dueDate index, so undated/null rows never appear.
export async function listDatedBlocks() {
	const live = await liveNoteIds();
	return blocks
		.orderBy('dueDate')
		.filter((block) => !block.deletedAt && live.has(block.noteId))
		.toArray();
}
