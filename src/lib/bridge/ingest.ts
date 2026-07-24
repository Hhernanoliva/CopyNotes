// The ingest boundary treats agent input like paste/backup: untrusted. Every
// agent-written field is sanitized here BEFORE it reaches the task-action layer,
// and the target note must still be agentVisible (the gate on the way in, not
// only on the way out). The agent may only create tasks, complete tasks, or add
// a bitácora note — never delete, export, or reorder.

import { sanitizeHtml, htmlToPlainText } from '$lib/format';
import { getNote, getBlock, getConnectedAgent, setConnectedAgent } from '$lib/storage';
import { createTask, completeTask, addTaskNote } from '$lib/tasks';

// Reduce any agent-supplied string to safe plain text: sanitize the markup,
// then flatten to text so it can never act as an html sink.
function toCleanText(raw) {
	return htmlToPlainText(sanitizeHtml(typeof raw === 'string' ? raw : ''));
}

// The actor must come from the stored connected-agent identity, never from
// the inbound file — change.agentId is untrusted and a malicious file could
// claim agentId: 'user' to forge attribution and hide the "Rehacer" control.
// v1 is single-agent: exactly one connected-agent row, lazily created here.
async function resolveAgentActor() {
	let agent = await getConnectedAgent();
	if (!agent) agent = await setConnectedAgent({ name: 'Agente local' });
	return agent.id;
}

const HANDLERS = {
	async createTask(change, actor) {
		const content = toCleanText(change.content);
		return createTask({ noteId: change.noteId, content, actor });
	},
	async completeTask(change, actor) {
		return completeTask({ blockId: change.blockId, actor, text: toCleanText(change.text) });
	},
	async addNote(change, actor) {
		return addTaskNote({ blockId: change.blockId, actor, text: toCleanText(change.text) });
	}
};

export async function ingestAgentChange(change) {
	// Own-property check, not a bare lookup: a bare HANDLERS[type] would resolve
	// reserved names like 'constructor' or '__proto__' off Object.prototype and
	// dodge the allow-list. The allow-list is exactly the three own keys.
	const type = change?.type;
	const handler = Object.hasOwn(HANDLERS, type) ? HANDLERS[type] : null;
	if (!handler) return { ok: false, reason: 'not-allowed' };

	// The note an operation lands on is authoritative from the target itself,
	// never from the agent's claimed change.noteId. createTask has no block yet
	// (it targets change.noteId); completeTask/addNote target an existing block,
	// whose own noteId is the one we gate on — so a stale blockId from a
	// once-visible, now-hidden note cannot be paired with a still-visible
	// noteId to slip past the gate.
	let noteId = change.noteId;
	if (change.type !== 'createTask') {
		const block = await getBlock(change.blockId);
		if (!block) return { ok: false, reason: 'not-agent-visible' };
		noteId = block.noteId;
	}

	const note = await getNote(noteId);
	if (!note || note.agentVisible !== true) return { ok: false, reason: 'not-agent-visible' };

	const actor = await resolveAgentActor();
	const result = await handler(change, actor);
	return { ok: true, result };
}
