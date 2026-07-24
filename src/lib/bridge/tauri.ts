// The desktop bridge's JS half. Desktop-only: off Tauri every export is a no-op
// and the watch is a no-op unlisten, so the browser/PWA build exposes no agent
// surface. Tauri APIs are imported dynamically so the web build never loads them.
import { isTauriRuntime } from '$lib/platform';
import { buildAgentExport } from './export';
import { ingestAgentChange } from './ingest';

async function writeAgentExportUnsafe() {
	if (!isTauriRuntime()) return;
	const { invoke } = await import('@tauri-apps/api/core');
	const payload = await buildAgentExport();
	await invoke('bridge_write_export', { contents: JSON.stringify(payload) });
}

// Serialize exports so overlapping calls write in submission order: the newest
// bump's payload is always the last written, so a hidden note can never be
// clobbered back into export.json by a slower, earlier (still-visible) export.
let exportChain = Promise.resolve();
export function writeAgentExport() {
	const run = exportChain.then(() => writeAgentExportUnsafe(), () => writeAgentExportUnsafe());
	exportChain = run.then(() => undefined, () => undefined);
	return run;
}

// Starts the Rust inbox watcher and ingests each agent change through the gate,
// then writes the per-change result to the outbox for the MCP server to read.
// Returns an unlisten fn. No-op (returns a noop) off desktop.
export async function startBridgeWatch(onIngested) {
	if (!isTauriRuntime()) return () => {};
	const { invoke } = await import('@tauri-apps/api/core');
	const { listen } = await import('@tauri-apps/api/event');
	await invoke('bridge_start_watch');
	// Rust emits the inbox file's raw text as the payload (a String). The
	// <string> type argument matches Tauri's own documented listen<T>(...)
	// usage — without it event.payload has no inferred type to JSON.parse.
	return listen<string>('bridge://change', async (event) => {
		let change;
		try {
			change = JSON.parse(event.payload);
		} catch {
			return; // ignore a malformed/partial inbox file
		}
		const result = await ingestAgentChange(change);
		if (change?.id) {
			try {
				await invoke('bridge_write_outbox', { id: change.id, contents: JSON.stringify(result) });
			} catch (e) {
				console.error('bridge_write_outbox failed', e);
			}
		}
		if (result.ok) onIngested?.();
	});
}

// Returns the mailbox folder's absolute path so it can be shown to the user
// (Settings > Agentes) for pointing an MCP client's CN_MAILBOX at it. null
// off desktop.
export async function getMailboxPath() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke('bridge_mailbox_path');
}
