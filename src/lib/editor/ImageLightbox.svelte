<script>
	// Ver la captura a tamaño real. No es adorno: un pantallazo de 3018 px dentro
	// de una columna de ~700 no se lee, y leerlo es para lo que se pegó.
	let { url, alt = '', onClose } = $props();

	function onKeydown(event) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="bg-background/95 fixed inset-0 z-50 overflow-auto p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Captura ampliada"
	tabindex="-1"
	onclick={onClose}
>
	<img src={url} {alt} class="mx-auto max-w-none" />
</div>
