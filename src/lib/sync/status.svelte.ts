// What Configuración › Nube shows about the last upload. In memory on purpose:
// the number that matters ("cuántos cambios sin subir") is recomputed from the
// database, so nothing here needs to survive a restart, and a sync status is not
// worth a write to storage every 30 seconds.
export const syncStatus = $state({
	pending: 0,
	uploading: false,
	lastUploadAt: null,
	// Spanish, already user-facing: this string is rendered as-is.
	error: null
});
