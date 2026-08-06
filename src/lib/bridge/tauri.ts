// The desktop bridge's JS half. Desktop-only: off Tauri every export is a no-op
// and the watch is a no-op unlisten, so the browser/PWA build exposes no agent
// surface. Tauri APIs are imported dynamically so the web build never loads them.
import { isTauriRuntime } from '$lib/platform';
import { buildAgentExport } from './export';
import { ingestAgentChange } from './ingest';
import { agentData } from './signal.svelte';

// What Rust sends per inbox request. Declared because listen<T>() otherwise
// hands back `unknown` and nothing can be read off the payload.
type Envelope = { file: string; text: string; boot: boolean };

async function writeAgentExportUnsafe() {
	if (!isTauriRuntime()) return;
	const { invoke } = await import('@tauri-apps/api/core');
	const payload = await buildAgentExport();
	await invoke('bridge_write_export', { contents: JSON.stringify(payload) });
}

// Serialize exports so overlapping calls write in submission order: the newest
// bump's payload is always the last written, so a hidden note can never be
// clobbered back into export.json by a slower, earlier (still-visible) export.
//
// Y el resultado se anota. Los tres lugares que llaman a esto tragaban el fallo
// con un `console.error`, que no lo mira nadie: si la escritura no sale —disco
// lleno, permisos— el export.json ANTERIOR se queda en el disco y el agente lo
// sigue leyendo. Cuando lo que se acaba de apretar es "Pausar agentes", eso es
// un interruptor de privacidad que no se cumplió y hay que decirlo. Se marca
// acá, en la única puerta por la que pasan las tres llamadas, y no en cada una.
let exportChain = Promise.resolve();
export function writeAgentExport() {
	const run = exportChain.then(() => writeAgentExportUnsafe(), () => writeAgentExportUnsafe());
	exportChain = run.then(() => undefined, () => undefined);
	// El error se sigue propagando: quien llame puede seguir haciendo lo suyo.
	return run.then(
		(value) => {
			agentData.exportFailed = false;
			return value;
		},
		(error) => {
			agentData.exportFailed = true;
			throw error;
		}
	);
}

// Starts the Rust inbox watcher and ingests each agent change through the gate,
// then writes the per-change result to the outbox for the MCP server to read.
// Returns an unlisten fn. No-op (returns a noop) off desktop.
export async function startBridgeWatch(onIngested) {
	if (!isTauriRuntime()) return () => {};
	const { invoke } = await import('@tauri-apps/api/core');
	const { listen } = await import('@tauri-apps/api/event');
	// Register the listener BEFORE starting the watcher: if bridge_start_watch
	// ran first, a file processed in the gap before listen() attaches would be
	// emitted with nobody listening (never ingested) and, because it is only
	// archived on ack, sit in the inbox until the next boot.
	//
	// The payload is an envelope: { file, text, boot }. `file` is what we ack
	// with — Rust keeps the request in the inbox until we do — and `boot` marks
	// the ones the startup sweep found, i.e. those that waited while the app was
	// closed. The type argument matches Tauri's own documented listen<T>(...)
	// usage; without it event.payload is `unknown` and nothing can be read off it.
	const unlisten = await listen<Envelope>('bridge://change', async (event) => {
		const envelope = event.payload;
		const file = typeof envelope?.file === 'string' ? envelope.file : null;
		let change = null;
		try {
			change = JSON.parse(envelope?.text ?? '');
		} catch {
			// A malformed/partial inbox file: nothing to apply. It still gets acked
			// below, or it would come back on every boot forever.
		}
		try {
			if (!change) return;
			const result = await ingestAgentChange(change);
			if (change?.id) {
				try {
					await invoke('bridge_write_outbox', { id: change.id, contents: JSON.stringify(result) });
				} catch (e) {
					console.error('bridge_write_outbox failed', e);
				}
			}
			if (result.ok) onIngested?.({ boot: envelope?.boot === true });
		} catch (error) {
			// A malformed change (e.g. a missing blockId making Dexie reject) must
			// still answer the outbox — otherwise the MCP client waits out the full
			// timeout instead of getting an immediate error.
			console.error('bridge ingest failed', error);
			if (change?.id) {
				await invoke('bridge_write_outbox', {
					id: change.id,
					contents: JSON.stringify({ id: change.id, ok: false, reason: 'error' })
				}).catch((e) => console.error('bridge_write_outbox failed', e));
			}
		} finally {
			// ALWAYS, on every exit path including the early return above: an unacked
			// request is replayed on the next boot, garbage included. The one case
			// that must NOT ack is the app dying mid-ingest — and there this never
			// runs, which is exactly the request we want replayed.
			if (file) {
				await invoke('bridge_ack', { file }).catch((e) => console.error('bridge_ack failed', e));
			}
		}
	});
	await invoke('bridge_start_watch');
	return unlisten;
}

// Returns the mailbox folder's absolute path so it can be shown to the user
// (Settings > Agentes) for pointing an MCP client's CN_MAILBOX at it. null
// off desktop.
export async function getMailboxPath() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke('bridge_mailbox_path');
}

// Returns the packaged MCP server's absolute path so Settings can pre-fill it
// in each client's config. null off desktop.
export async function getServerPath() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke('bridge_server_path');
}

// Reads the MCP server's liveness heartbeat so Settings can show "un agente se
// conectó — hace X". Returns { lastSeen } or null (off desktop / never seen).
export async function getAgentStatus() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	const raw = await invoke('bridge_read_status');
	if (typeof raw !== 'string') return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
