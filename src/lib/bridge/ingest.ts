// The ingest boundary treats agent input like paste/backup: untrusted. Every
// agent-written field is sanitized here BEFORE it reaches the task-action layer,
// and the target note must still be agentVisible (the gate on the way in, not
// only on the way out). The agent may only create tasks, complete tasks, or add
// a bitácora note — never delete, export, or reorder.

import { sanitizeHtml, htmlToPlainText } from '$lib/format';
import { getNote } from '$lib/storage';
import { createTask, completeTask, addTaskNote } from '$lib/tasks';

// Reduce any agent-supplied string to safe plain text: sanitize the markup,
// then flatten to text so it can never act as an html sink.
function toCleanText(raw) {
	return htmlToPlainText(sanitizeHtml(typeof raw === 'string' ? raw : ''));
}

const HANDLERS = {
	async createTask(change) {
		const content = toCleanText(change.content);
		return createTask({ noteId: change.noteId, content, actor: change.agentId });
	},
	async completeTask(change) {
		return completeTask({ blockId: change.blockId, actor: change.agentId, text: toCleanText(change.text) });
	},
	async addNote(change) {
		return addTaskNote({ blockId: change.blockId, actor: change.agentId, text: toCleanText(change.text) });
	}
};

export async function ingestAgentChange(change) {
	const handler = HANDLERS[change?.type];
	if (!handler) return { ok: false, reason: 'not-allowed' };

	const note = await getNote(change.noteId);
	if (!note || note.agentVisible !== true) return { ok: false, reason: 'not-agent-visible' };

	const result = await handler(change);
	return { ok: true, result };
}
