// Shared shapes for the buzón (agent inbox/outbox) protocol, so ingest.ts and
// the future MCP server (Milestone M) never drift on wire format.

export const REASON = {
	notAllowed: 'not-allowed',
	notAgentVisible: 'not-agent-visible',
	notATask: 'not-a-task',
	// The user pulled the master switch. Its own reason, not not-agent-visible,
	// so the agent can tell "this note is private" from "everything is off right
	// now" and stop retrying against every note it knows.
	agentsPaused: 'agents-paused'
};

// What may travel back OUT to the agent, mirroring the allow-list `export.ts`
// applies on the way in. The task layer returns whole database rows, and a whole
// row carries `note` — the user's private comment, which export.ts discards on
// purpose and in capitals. Serialized into outbox/<id>.json, that comment left
// the app through the one door built to keep it in.
//
// Copying named fields, not deleting unwanted ones: a block field added later
// is invisible here until someone decides it may leave.
function projectBlock(block) {
	return block
		? { id: block.id, type: block.type, content: block.content, checked: block.checked === true }
		: block;
}

function projectActivity(activity) {
	return activity ? { id: activity.id, action: activity.action, at: activity.at } : activity;
}

// Attaches the change id to an outcome so a response can be matched back to
// its request, and stored/replayed for idempotent redelivery. Every answer the
// buzón writes is built here, which is why the projection lives here too: a new
// handler cannot forget it.
export function changeResult(id, outcome) {
	if (!outcome?.result) return { id, ...outcome };
	const { block, activity, ...rest } = outcome.result;
	return {
		id,
		...outcome,
		result: { ...rest, block: projectBlock(block), activity: projectActivity(activity) }
	};
}
