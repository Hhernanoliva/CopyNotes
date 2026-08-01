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

// Attaches the change id to an outcome so a response can be matched back to
// its request, and stored/replayed for idempotent redelivery.
export function changeResult(id, outcome) {
	return { id, ...outcome };
}
