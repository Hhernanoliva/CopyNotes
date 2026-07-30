import { db } from './db';
import { createId, now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { topSortOrder } from './organize';
import { trackPendingWrite } from './pending-writes';
import { bumpAgentData } from '$lib/bridge/signal.svelte';

const notes = db.table('notes');

// Safety net (spec 2026-07-24 puerta única): every note write bumps the
// agent-data signal after the write resolves — a title change or a deletion
// travels to the agent export, which can never go stale. Reads never bump.

export function createNote({ title = '' } = {}) {
	return trackPendingWrite(async () => {
		const sortOrder = await topSortOrder('note');
		const timestamp = now();
		const note = {
			id: createId(),
			title,
			sortOrder,
			folderId: null,
			agentVisible: false,
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null
		};
		await notes.add(note);
		bumpAgentData();
		return note;
	});
}

export async function getNote(id) {
	const note = await notes.get(id);
	if (!note || note.deletedAt) return undefined;
	return note;
}

export async function listNotes() {
	const rows = await notes.filter((note) => !note.deletedAt).toArray();
	return sortBySidebarOrder(rows);
}

export function updateNote(id, changes) {
	return trackPendingWrite(async () => {
		// Only bump on a real write (0 rows for a missing id), same as updateBlock.
		const updated = await notes.update(id, { ...changes, updatedAt: now() });
		if (updated) bumpAgentData();
		return notes.get(id);
	});
}

// Deleting a note cascades to its blocks in one transaction. Without this the
// blocks stay live and resurface as ghosts in Search and Agenda (they list
// blocks across all notes) under a "Sin título" label, opening a note that no
// longer exists.
export function softDeleteNote(id) {
	return trackPendingWrite(async () => {
		const timestamp = now();
		const blocks = db.table('blocks');
		await db.transaction('rw', notes, blocks, async () => {
			await notes.update(id, { deletedAt: timestamp, updatedAt: timestamp });
			await blocks
				.where('noteId')
				.equals(id)
				.modify((block) => {
					if (!block.deletedAt) {
						block.deletedAt = timestamp;
						block.updatedAt = timestamp;
					}
				});
		});
		bumpAgentData();
	});
}
