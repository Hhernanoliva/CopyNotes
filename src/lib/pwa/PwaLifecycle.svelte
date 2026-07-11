<script>
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { toast } from 'svelte-sonner';

	// Register the service worker as soon as this mounts. registerType
	// 'autoUpdate' quietly swaps in a new version on the next load, so there is
	// no update prompt to manage here — we only celebrate offline readiness once.
	const { offlineReady } = useRegisterSW({
		immediate: true,
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
</script>
