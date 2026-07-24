// Shared shapes for the buzón (agent inbox/outbox) protocol, so ingest.ts and
// the future MCP server (Milestone M) never drift on wire format.

export const REASON = {
	notAllowed: 'not-allowed',
	notAgentVisible: 'not-agent-visible',
	notATask: 'not-a-task'
};

// Attaches the change id to an outcome so a response can be matched back to
// its request, and stored/replayed for idempotent redelivery.
export function changeResult(id, outcome) {
	return { id, ...outcome };
}
