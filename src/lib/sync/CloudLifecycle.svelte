<script>
	// The cloud's heartbeat, and the only place that tells the screen something
	// arrived (spec 030 phase 3). Same shape as `bridge/BridgeLifecycle.svelte`,
	// which does this for changes an agent makes from outside the app.
	import { startUploadClock, syncNow } from '$lib/sync/upload';
	import { startLiveChannel } from '$lib/sync/live';
	import { currentSession } from '$lib/sync/supabase';
	import { syncStatus } from '$lib/sync/status.svelte';
	import { agentData } from '$lib/bridge/signal.svelte';
	import { createExportScheduler } from '$lib/bridge/schedule';

	let { onCloudChanged } = $props();

	// After the last keystroke of a burst: long enough to fold the burst into one
	// upload, short enough that the other device sees it in 2-3 seconds.
	const AFTER_TYPING_MS = 1500;
	// How long the screen waits rather than refreshing under someone's fingers.
	const QUIET_MS = 2000;

	// Every gate lives inside the clock (no project configured, no session, no
	// consent, no vault), so this is inert on a local-only install.
	$effect(() => startUploadClock());

	// One websocket per account, opened once the session is known. It is what
	// tells this device whether anybody else is connected — the switch that keeps
	// a single-device user from ever sending a realtime message.
	$effect(() => {
		let stop = null;
		let disposed = false;
		currentSession()
			.then((session) => {
				if (!session || disposed) return;
				stop = startLiveChannel({
					userId: session.user.id,
					// The nudge carries nothing: "come and look", and the looking goes
					// through the same encrypted download path as always.
					onNudge: () => syncNow()
				});
			})
			.catch((error) => console.error('No se pudo abrir el canal de la nube', error));
		return () => {
			disposed = true;
			stop?.();
		};
	});

	// Upload as soon as typing stops — but only when somebody is on the other
	// side. Alone, the quiet 30-second clock is enough and costs nothing.
	const uploadScheduler = createExportScheduler(() => syncNow(), AFTER_TYPING_MS);

	// Plain guards, not $state: they are read inside effects that must not depend
	// on them. Same trick BridgeLifecycle uses for `lastUrgent`.
	let lastLocalWrite = 0;
	let lastSeenWrite = agentData.version;
	let seen = syncStatus.appliedVersion;
	let quietTimer = null;

	$effect(() => {
		const version = agentData.version;
		if (version === lastSeenWrite) return;
		lastSeenWrite = version;
		lastLocalWrite = Date.now();
		if (syncStatus.peers > 0) uploadScheduler.schedule();
	});

	// Refreshing the screen re-mounts the editor, so doing it mid-sentence would
	// move the cursor under someone's fingers. At 30-second intervals that
	// practically never collided; at two seconds it would.
	function refreshWhenQuiet() {
		clearTimeout(quietTimer);
		const since = Date.now() - lastLocalWrite;
		if (since < QUIET_MS) {
			quietTimer = setTimeout(refreshWhenQuiet, QUIET_MS - since);
			return;
		}
		onCloudChanged?.();
	}

	// Only when something from the cloud actually landed in the database — a sync
	// that uploads, or finds nothing new, must not reload the screen at all.
	$effect(() => {
		const version = syncStatus.appliedVersion;
		if (version === seen) return;
		seen = version;
		refreshWhenQuiet();
	});

	$effect(() => () => {
		clearTimeout(quietTimer);
		uploadScheduler.cancel();
	});
</script>
