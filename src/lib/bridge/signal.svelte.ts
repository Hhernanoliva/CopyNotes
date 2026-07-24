// A tiny reactive counter the desktop bridge will watch (in P3) to know WHEN to
// re-export agent-visible tasks. Bumped on every agent-relevant write and on any
// agentVisible change — so hiding a note always triggers a re-export (a hidden
// note can never linger in export.json).
export const agentData = $state({ version: 0, urgent: 0 });

export function bumpAgentData() {
	agentData.version++;
}

// Privacy-sensitive removal (hiding a note): bump `urgent` too so the bridge
// re-exports IMMEDIATELY, skipping the debounce — a just-hidden note must leave
// export.json without the ≤500 ms delay the normal path allows.
export function bumpAgentDataUrgent() {
	agentData.version++;
	agentData.urgent++;
}
