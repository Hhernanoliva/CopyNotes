<script>
	import { isTauriRuntime } from '$lib/platform';
	import { agentData } from './signal.svelte';
	import { writeAgentExport, startBridgeWatch } from './tauri';

	let { onAgentIngested } = $props();

	// Re-export whenever agent-relevant data changes (a task write or a
	// visibility toggle bumps agentData.version). writeAgentExport no-ops off
	// desktop. Hiding a note bumps the signal → always re-exports, so a hidden
	// note can never linger in export.json.
	$effect(() => {
		void agentData.version;
		writeAgentExport().catch((error) => console.error('agent export failed', error));
	});

	// Start the inbox watcher ONCE on mount (desktop-only). Reads no reactive
	// state synchronously, so it never re-runs (a second start would spawn a
	// duplicate watcher). After each ingested change, re-export and refresh the UI.
	$effect(() => {
		if (!isTauriRuntime()) return;
		let unlisten = null;
		let disposed = false;
		startBridgeWatch(() => {
			writeAgentExport().catch((error) => console.error('agent export failed', error));
			onAgentIngested?.();
		})
			.then((stop) => {
				if (disposed) stop?.();
				else unlisten = stop;
			})
			.catch((error) => console.error('bridge watch failed to start', error));
		return () => {
			disposed = true;
			unlisten?.();
		};
	});
</script>
