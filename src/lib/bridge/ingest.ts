// The ingest boundary treats agent input like paste/backup: untrusted. Every
// agent-written field is sanitized here BEFORE it reaches the task-action layer,
// and the target note must still be agentVisible (the gate on the way in, not
// only on the way out). The agent may only create tasks, complete tasks, or add
// a bitácora note — never delete, export, or reorder.

import { sanitizeHtml, htmlToPlainText } from '$lib/format';
import {
	getNote,
	getBlock,
	getConnectedAgent,
	setConnectedAgent,
	getProcessedChange,
	recordProcessedChange
} from '$lib/storage';
import { createTask, completeTask, addTaskNote } from '$lib/tasks';
import { REASON, changeResult } from './protocol';

// Reduce any agent-supplied string to safe plain text: sanitize the markup,
// then flatten to text so it can never act as an html sink.
function toCleanText(raw) {
	return htmlToPlainText(sanitizeHtml(typeof raw === 'string' ? raw : '')).slice(0, 2000);
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

// Computes the outcome of a change with no knowledge of dedupe/ids — every
// gate below is unchanged from before Task P1, just returning REASON
// constants instead of inline strings.
async function applyChange(change) {
	// Own-property check, not a bare lookup: a bare HANDLERS[type] would resolve
	// reserved names like 'constructor' or '__proto__' off Object.prototype and
	// dodge the allow-list. The allow-list is exactly the three own keys.
	const type = change?.type;
	const handler = Object.hasOwn(HANDLERS, type) ? HANDLERS[type] : null;
	if (!handler) return { ok: false, reason: REASON.notAllowed };

	// The note an operation lands on is authoritative from the target itself,
	// never from the agent's claimed change.noteId. createTask has no block yet
	// (it targets change.noteId); completeTask/addNote target an existing block,
	// whose own noteId is the one we gate on — so a stale blockId from a
	// once-visible, now-hidden note cannot be paired with a still-visible
	// noteId to slip past the gate.
	let noteId = change.noteId;
	let block = null;
	if (change.type !== 'createTask') {
		block = await getBlock(change.blockId);
		if (!block) return { ok: false, reason: REASON.notAgentVisible };
		noteId = block.noteId;
	}

	const note = await getNote(noteId);
	if (!note || note.agentVisible !== true) return { ok: false, reason: REASON.notAgentVisible };

	// The target must be a live todo block: a completeTask/addNote pointed at a
	// text/bullet/heading block would otherwise set checked:true or append
	// activity on a non-task. Checked after the visibility gate so a hidden
	// note always yields not-agent-visible, never leaking block-type info.
	if (change.type !== 'createTask' && block.type !== 'todo') {
		return { ok: false, reason: REASON.notATask };
	}

	const actor = await resolveAgentActor();
	const result = await handler(change, actor);
	return { ok: true, result };
}

// Request/response with idempotency (Task P1): every change carries a unique
// id, and the settled result (success or definitive rejection — both are
// final answers, not retryable) is recorded so redelivering the same id
// returns the SAME result without re-applying the change. NOT safe to run
// concurrently: the check→apply→record sequence must not interleave, so the
// exported wrapper below serializes calls.
async function ingestAgentChangeUnsafe(change) {
	if (change?.id) {
		const seen = await getProcessedChange(change.id);
		if (seen) return seen;
	}

	const outcome = await applyChange(change);

	const result = changeResult(change?.id, outcome);
	if (change?.id) await recordProcessedChange(change.id, result);
	return result;
}

// All ingests run one at a time in this process, so the dedupe check → apply →
// record sequence is atomic: a duplicate id delivered while its first delivery
// is still in flight waits, then sees the recorded result instead of
// re-applying. The webview is the only applier, so a per-process chain suffices.
let ingestChain = Promise.resolve();
export function ingestAgentChange(change) {
	const run = ingestChain.then(
		() => ingestAgentChangeUnsafe(change),
		() => ingestAgentChangeUnsafe(change)
	);
	// Keep the chain alive whether this call resolves or rejects; swallow so a
	// prior failure never rejects a later, unrelated ingest.
	ingestChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}
