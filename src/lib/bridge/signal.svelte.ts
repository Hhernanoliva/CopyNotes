// A tiny reactive counter the desktop bridge will watch (in P3) to know WHEN to
// re-export agent-visible tasks. Bumped on every agent-relevant write and on any
// agentVisible change — so hiding a note always triggers a re-export (a hidden
// note can never linger in export.json).
// `exportFailed` no es un contador sino un estado: la última escritura de
// export.json —el archivo que el agente LEE— no salió. Mientras esté puesto, lo
// que hay en el disco es la versión anterior, y Configuración › Agentes lo dice
// en pantalla. Lo escribe `writeAgentExport` y nadie más (bridge/tauri.ts).
export const agentData = $state({ version: 0, urgent: 0, exportFailed: false });

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
