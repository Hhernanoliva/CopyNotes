// The single place to create, edit, complete, reopen, and read TASKS (todo
// blocks). Both the app UI and the agent bridge call this layer; it wraps the
// block repositories and appends the matching activity (bitácora) entry, so
// there is never a second, divergent write path. It assumes its text/html
// inputs are already clean — the bridge runs untrusted agent input through the
// ingest gate BEFORE calling here (see src/lib/bridge/ingest.ts).

import {
	createBlock,
	updateBlock,
	getBlock,
	listBlocksByNote,
	appendActivity,
	listActivityByBlock
} from '$lib/storage';
import { plainTextToHtml } from '$lib/format';

export async function createTask({ noteId, parentBlockId = null, content = '', html = undefined, actor = 'user' }) {
	const block = await createBlock({
		noteId,
		parentBlockId,
		type: 'todo',
		content,
		html: html ?? plainTextToHtml(content),
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
}

export async function completeTask({ blockId, actor, text = '' }) {
	const block = await updateBlock(blockId, { checked: true });
	if (!block) return undefined;
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'done',
		text
	});
	return { block, activity };
}

export async function reopenTask({ blockId, actor = 'user', text = '' }) {
	const block = await updateBlock(blockId, { checked: false });
	if (!block) return undefined;
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'reopened',
		text
	});
	return { block, activity };
}

// The user's redo channel: an instruction line the agent can read. Stored as
// plain text on the activity row (never in block.html), rendered escaped.
export async function addTaskNote({ blockId, actor = 'user', text }) {
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
}

export async function editTask({ blockId, content, html = undefined, actor = 'user' }) {
	// When html is omitted, derive it from content (escaped) so a plain-text
	// edit can never smuggle markup into block.html.
	const changes = { content, html: html !== undefined ? html : plainTextToHtml(content) };
	const block = await updateBlock(blockId, changes);
	if (!block) return undefined;
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'edited',
		text: content
	});
	return { block, activity };
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
