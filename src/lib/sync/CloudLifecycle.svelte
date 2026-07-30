<script>
	// The cloud's heartbeat, and the only place that tells the screen something
	// arrived (spec 030 phase 3). Same shape as `bridge/BridgeLifecycle.svelte`,
	// which does this for changes an agent makes from outside the app.
	import { startUploadClock } from '$lib/sync/upload';
	import { syncStatus } from '$lib/sync/status.svelte';

	let { onCloudChanged } = $props();

	// Every gate lives inside the clock (no project configured, no session, no
	// consent, no vault), so this is inert on a local-only install.
	$effect(() => startUploadClock());

	// A plain guard, not $state: reading it in the effect below must not make the
	// effect depend on it. Same trick BridgeLifecycle uses for `lastUrgent`.
	let seen = syncStatus.appliedVersion;

	// Only when something from the cloud actually landed in the database — a sync
	// that uploads or finds nothing new must not reload the screen under the
	// user's hands.
	$effect(() => {
		const version = syncStatus.appliedVersion;
		if (version === seen) return;
		seen = version;
		onCloudChanged?.();
	});
</script>
