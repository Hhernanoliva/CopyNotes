import { db } from './db';
import { createId, now } from './ids';
import { sortBySidebarOrder } from '../organize';
import { shiftRootDown } from './organize';
import { trackPendingWrite } from './pending-writes';

const notes = db.table('notes');

export function createNote({ title = '' } = {}) {
	return trackPendingWrite(async () => {
		await shiftRootDown('note');
		const timestamp = now();
		const note = {
			id: createId(),
			title,
			sortOrder: 0,
			folderId: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null
		};
		await notes.add(note);
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
		await notes.update(id, { ...changes, updatedAt: now() });
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
	});
}
