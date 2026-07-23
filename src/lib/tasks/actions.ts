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

export async function createTask({ noteId, parentBlockId = null, content = '', html, actor = 'user' }) {
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
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'done',
		text
	});
	return { block, activity };
}
