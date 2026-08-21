<script>
	// Ver la captura a tamaño real. No es adorno: un pantallazo de 3018 px dentro
	// de una columna de ~700 no se lee, y leerlo es para lo que se pegó.
	let { url, alt = '', onClose } = $props();

	let dialog = $state();

	// `aria-modal="true"` le dice al lector de pantalla que esconda todo lo de
	// afuera. Si el foco no entra, quien lo abrió con el teclado queda parado en un
	// botón que ya no existe para él y sin nada que leer. Al cerrar el foco vuelve
	// a donde estaba, que es lo que deja seguir leyendo la nota.
	$effect(() => {
		// `instanceof` y no un cast: `document.activeElement` está tipado como
		// `Element`, que no tiene `focus()`, y este proyecto no usa casts.
		const opener = document.activeElement;
		dialog?.focus();
		return () => {
			if (opener instanceof HTMLElement) opener.focus();
		};
	});

	function onKeydown(event) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	bind:this={dialog}
	class="bg-background/95 fixed inset-0 z-50 overflow-auto p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Captura ampliada"
	data-editor-transient
	tabindex="-1"
	onpointerdown={(event) => event.stopPropagation()}
	onclick={onClose}
>
	<img src={url} {alt} class="mx-auto max-w-none" />
</div>
