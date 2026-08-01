<script>
	import { isTauriRuntime } from '$lib/platform';
	import { agentData } from './signal.svelte';
	import { writeAgentExport, startBridgeWatch } from './tauri';
	import { createExportScheduler } from './schedule';

	let { onAgentIngested, onAgentBacklog } = $props();

	// Re-export whenever agent-relevant data changes. With the storage safety
	// net (every notes/blocks write bumps agentData.version) this fires on any
	// keystroke's save, so the scheduler folds bursts into one trailing write
	// 500 ms after quiet. Hiding a note re-exports too (≤500 ms later — same
	// order as the pre-existing read/write race window). writeAgentExport
	// no-ops off desktop. The mount run (version 0) keeps the boot export.
	const exportScheduler = createExportScheduler(() => {
		writeAgentExport().catch((error) => console.error('agent export failed', error));
	});
	// A plain guard (not $state) that lets one effect tell a normal bump from an
	// urgent one: when agentData.urgent advances, hide-a-note happened → export
	// NOW and skip the debounce; otherwise fold into the trailing write.
	let lastUrgent = agentData.urgent;
	$effect(() => {
		void agentData.version;
		const urgent = agentData.urgent;
		if (urgent !== lastUrgent) {
			lastUrgent = urgent;
			exportScheduler.cancel();
			writeAgentExport().catch((error) => console.error('agent export failed', error));
		} else {
			exportScheduler.schedule();
		}
		return () => exportScheduler.cancel();
	});

	// Start the inbox watcher ONCE on mount (desktop-only). Reads no reactive
	// state synchronously, so it never re-runs (a second start would spawn a
	// duplicate watcher). After each ingested change, re-export and refresh the UI.
	//
	// Requests that waited in the mailbox while the app was closed arrive one by
	// one during Rust's startup sweep (flagged `boot`). They are counted behind a
	// short quiet window so the person gets ONE line about what happened while
	// they were away, not one toast per change.
	const BACKLOG_QUIET_MS = 800;
	$effect(() => {
		if (!isTauriRuntime()) return;
		let unlisten = null;
		let disposed = false;
		let backlog = 0;
		let backlogTimer;
		startBridgeWatch((info) => {
			writeAgentExport().catch((error) => console.error('agent export failed', error));
			onAgentIngested?.();
			if (!info?.boot) return;
			backlog += 1;
			clearTimeout(backlogTimer);
			backlogTimer = setTimeout(() => {
				onAgentBacklog?.(backlog);
				backlog = 0;
			}, BACKLOG_QUIET_MS);
		})
			.then((stop) => {
				if (disposed) stop?.();
				else unlisten = stop;
			})
			.catch((error) => console.error('bridge watch failed to start', error));
		return () => {
			disposed = true;
			clearTimeout(backlogTimer);
			unlisten?.();
		};
	});
</script>
