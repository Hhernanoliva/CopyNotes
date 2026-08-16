<script>
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { toast } from 'svelte-sonner';
	import { checkPeriodically, watchForNewVersion } from './web-update';

	// Register the service worker as soon as this mounts. registerType
	// 'autoUpdate' quietly swaps in a new version on the next load, so there is
	// no update prompt to manage here — we only celebrate offline readiness once.
	//
	// "En la próxima carga" era el agujero: una pestaña que no vuelve a cargar de verdad
	// se queda con el código viejo para siempre, y en el iPhone eso son días. El
	// 2026-08-16 costó tres rondas de diagnóstico y dos arreglos publicados descubrir
	// que el bug que Hernán veía ya estaba arreglado y su teléfono no lo tenía. Desde
	// ahora el cambio de control ofrece el botón, y `checkPeriodically` hace que la
	// pregunta exista aunque nadie cierre nunca la app. La lógica y el porqué de cada
	// guardia están en `web-update.js`, que sí tiene pruebas.
	let registration = $state(null);

	const { offlineReady } = useRegisterSW({
		immediate: true,
		onRegisteredSW(url, swRegistration) {
			registration = swRegistration ?? null;
		},
		onRegisterError(error) {
			console.error('No se pudo registrar el service worker', error);
		}
	});

	let announced = false;
	$effect(() => {
		if ($offlineReady && !announced) {
			announced = true;
			toast.success('Listo para usar sin conexión');
		}
	});

	// Recargar y nada más: el service worker nuevo YA tomó el control, así que lo único
	// que falta es que la página vuelva a arrancar y tome el código que corresponde.
	// Y NO se recarga solo a propósito: cortarle una frase a la mitad a alguien que
	// está escribiendo, para darle una mejora que no pidió, es peor que la versión vieja.
	function offerUpdate() {
		toast('Hay una versión nueva de CopyNotes', {
			description: 'Tus notas no se tocan.',
			duration: Number.POSITIVE_INFINITY,
			action: {
				label: 'Actualizar',
				onClick: () => location.reload()
			}
		});
	}

	$effect(() => watchForNewVersion(navigator.serviceWorker, offerUpdate));

	$effect(() => checkPeriodically(registration));
</script>
