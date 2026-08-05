<script>
	import { settlePendingWrites } from '$lib/storage';
	import { writeAgentExport } from '$lib/bridge/tauri';
	import { toast } from 'svelte-sonner';

	// Desktop-only counterpart to PwaLifecycle. The layout mounts this only in
	// the Tauri runtime. It intercepts the native window-close so the same
	// pending-write barrier that guards backups and imports also guards the
	// moment the app quits: no delayed save is lost by closing the window.
	//
	// Tauri APIs are imported dynamically inside the effect so this file never
	// runs during the static prerender (there is no Tauri global there) and so
	// the browser build does not need to resolve them at module load.
	$effect(() => {
		let unlisten = null;
		let disposed = false;

		import('@tauri-apps/api/window')
			.then(({ getCurrentWindow }) => {
				const appWindow = getCurrentWindow();
				return appWindow.onCloseRequested(async (event) => {
					// Hold the window open until the barrier settles. If a save is
					// still in flight it runs now; only then do we really close.
					event.preventDefault();
					try {
						// La barrera avisa con `false` cuando un guardado falló y su texto
						// quedó sólo en memoria. Cerrar ahí lo perdería, así que la ventana
						// se queda abierta — es lo mismo que hace el `catch` de abajo, que
						// nunca se enteraba porque la barrera resolvía siempre bien.
						if (!(await settlePendingWrites())) {
							toast.error('No se pudo guardar. La ventana sigue abierta para reintentar.');
							return;
						}
						// The barrier only covers the database. export.json is the file
						// the agent actually reads, and its re-export is debounced, so
						// closing now could leave behind a file that still names a note
						// you just hid. Rewrite it from the settled data first.
						// A failure here is logged, not fatal: refusing to close would
						// trap the user in the app, and the file stays stale either way.
						await writeAgentExport().catch((error) =>
							console.error('No se pudo actualizar export.json antes de cerrar', error)
						);
						await appWindow.destroy();
					} catch (error) {
						// A save failed: keep the window open so nothing is lost and
						// the user can retry, rather than quitting over a bad write.
						console.error('No se pudo guardar antes de cerrar', error);
						toast.error('No se pudo guardar. La ventana sigue abierta para reintentar.');
					}
				});
			})
			.then((stop) => {
				if (disposed) stop();
				else unlisten = stop;
			})
			.catch((error) => {
				console.error('No se pudo enganchar el cierre de ventana de Tauri', error);
			});

		return () => {
			disposed = true;
			unlisten?.();
		};
	});
</script>
