// A tiny reactive counter the desktop bridge will watch (in P3) to know WHEN to
// re-export agent-visible tasks. Bumped on every agent-relevant write and on any
// agentVisible change — so hiding a note always triggers a re-export (a hidden
// note can never linger in export.json).
export const agentData = $state({ version: 0 });

export function bumpAgentData() {
	agentData.version++;
}
