// The ingest boundary treats agent input like paste/backup: untrusted. Every
// agent-written field is sanitized here BEFORE it reaches the task-action layer,
// and the target note must still be agentVisible (the gate on the way in, not
// only on the way out). The agent may only create tasks, complete tasks, or add
// a bitácora note — never delete, export, or reorder.

import { sanitizeHtml, htmlToPlainText } from '$lib/format';
import {
	db,
	getNote,
	getBlock,
	listChildBlocks,
	getConnectedAgent,
	setConnectedAgent,
	getProcessedChange,
	recordProcessedChange,
	putProcessedChangeInTx,
	trackPendingWrite,
	getAgentsPaused
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

// Each handler returns a thunk, not a result: everything it needs is resolved
// during the check phase, so the thunk itself is pure writes and can run inside
// the single transaction below. `createTask` gets its sibling `order` passed in
// for exactly that reason — resolving it internally does a chained Collection
// read, which (wrapped in trackPendingWrite's native promise) escapes Dexie's
// transaction zone and commits it early. tasks/actions.ts documents the trap;
// the editor passes `order` for the same reason.
const HANDLERS = {
	async createTask(change, actor, noteId) {
		const content = toCleanText(change.content);
		const siblings = await listChildBlocks(noteId, null);
		const order = siblings.length;
		return () => createTask({ noteId, content, actor, order });
	},
	async completeTask(change, actor) {
		const text = toCleanText(change.text);
		return () => completeTask({ blockId: change.blockId, actor, text });
	},
	async addNote(change, actor) {
		const text = toCleanText(change.text);
		return () => addTaskNote({ blockId: change.blockId, actor, text });
	}
};

// Runs every gate and every read a change needs, WITHOUT writing anything, and
// returns either `{ reason }` (rejected) or `{ run }` (a thunk of pure writes).
// The split exists so the writes can be wrapped in one transaction; the gates
// themselves are unchanged.
async function checkChange(change) {
	// Own-property check, not a bare lookup: a bare HANDLERS[type] would resolve
	// reserved names like 'constructor' or '__proto__' off Object.prototype and
	// dodge the allow-list. The allow-list is exactly the three own keys.
	const type = change?.type;
	const handler = Object.hasOwn(HANDLERS, type) ? HANDLERS[type] : null;
	if (!handler) return { reason: REASON.notAllowed };

	// The master switch, checked before anything else: while it is on, no request
	// gets in no matter which note it targets. Read from the DB, not from a cached
	// flag, so the pause takes effect on the very next request.
	if (await getAgentsPaused()) return { reason: REASON.agentsPaused };

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
		if (!block) return { reason: REASON.notAgentVisible };
		noteId = block.noteId;
	}

	const note = await getNote(noteId);
	if (!note || note.agentVisible !== true) return { reason: REASON.notAgentVisible };

	// The target must be a live todo block: a completeTask/addNote pointed at a
	// text/bullet/heading block would otherwise set checked:true or append
	// activity on a non-task. Checked after the visibility gate so a hidden
	// note always yields not-agent-visible, never leaking block-type info.
	if (change.type !== 'createTask' && block.type !== 'todo') {
		return { reason: REASON.notATask };
	}

	// Resolving the agent identity can CREATE the connected-agent row, and
	// setConnectedAgent goes through trackPendingWrite — so it stays out here,
	// before the transaction opens.
	const actor = await resolveAgentActor();
	return { run: await handler(change, actor, noteId) };
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

	const checked = await checkChange(change);

	// A rejection wrote nothing, so its ledger entry needs no transaction: the
	// worst a crash before it can do is make the agent's retry get the same
	// rejection recomputed.
	//
	// `agents-paused` is the ONE rejection that is not archived: every other
	// reason is a settled answer (that note is private, that block is not a
	// task), while the pause exists to be lifted. Archived, it would outlive the
	// pause — a request that timed out against a closed app keeps its id for 30 s
	// (mcp/lib/mailbox.js), so resuming and retrying inside that window would
	// replay the stale "paused" answer with the agents already running.
	if (!checked.run) {
		const result = changeResult(change?.id, { ok: false, reason: checked.reason });
		if (change?.id && checked.reason !== REASON.agentsPaused) {
			await recordProcessedChange(change.id, result);
		}
		return result;
	}

	// The change and its dedupe entry commit TOGETHER. A crash between the two
	// used to leave a task applied but unrecorded — harmless while the inbox file
	// was archived on delivery, but the ack protocol (src-tauri/src/bridge.rs)
	// keeps an unconfirmed file and replays it on the next boot, and an
	// unrecorded id would apply that replay a second time. `settings` joins the
	// scope because the ledger lives there (storage/dedupe.ts).
	return trackPendingWrite(() =>
		db.transaction(
			'rw',
			db.table('blocks'),
			db.table('activity'),
			db.table('settings'),
			async () => {
				const result = changeResult(change?.id, { ok: true, result: await checked.run() });
				if (change?.id) await putProcessedChangeInTx(change.id, result);
				return result;
			}
		)
	);
}

// All ingests run one at a time in this process, so the dedupe check → apply →
// record sequence is atomic: a duplicate id delivered while its first delivery
// is still in flight waits, then sees the recorded result instead of
// re-applying. The webview is the only applier, so a per-process chain suffices.
//
// Sync (030) needs nothing added here. An agent write is an ordinary repository
// write, so `db.ts`'s hooks stamp it and it uploads encrypted like any keystroke
// (proved in `ingest.test.ts` › "agent writes and the cloud"). A record parked
// in `conflicts` is no exception: `sync/download.ts` leaves the local row
// untouched while a conflict stands, so an agent editing it behaves exactly like
// the user editing it — the parked remote version keeps waiting for a decision.
// The dedupe ledger lives in `settings`, which does not sync: that is correct,
// because a change already applied here has arrived on the other device as data,
// not as a request to replay.
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
