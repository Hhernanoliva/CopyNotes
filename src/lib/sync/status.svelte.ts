// What Configuración › Nube shows about the last upload. In memory on purpose:
// the number that matters ("cuántos cambios sin subir") is recomputed from the
// database, so nothing here needs to survive a restart, and a sync status is not
// worth a write to storage every 30 seconds.
export const syncStatus = $state({
	pending: 0,
	uploading: false,
	lastUploadAt: null,
	// Records that came down and were left alone because this device has its own
	// unsent version of them (spec 030 phase 3). Phase 2 of that plan gives them
	// a screen; until then the number is the honest thing to show.
	conflicts: 0,
	// Other devices of this account connected right now. Zero means the app stays
	// on its quiet 30-second clock and sends no realtime message at all — the rule
	// that keeps the cloud bill near zero (see `live.ts`).
	peers: 0,
	// 'apagado' | 'conectando' | 'listo' | the failure, in words. A channel that
	// is down is not a broken app — everything works at the slow pace — which is
	// exactly why it has to be visible instead of silent.
	live: 'apagado',
	// Bumped whenever something from the cloud actually landed in the database.
	// `CloudLifecycle` watches it to refresh the screen — the same job the agent
	// bridge does with `agentData.version`.
	appliedVersion: 0,
	// Spanish, already user-facing: this string is rendered as-is.
	error: null
});
