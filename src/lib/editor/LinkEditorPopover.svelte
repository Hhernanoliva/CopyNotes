<script>
	let { initialUrl = '', onSave, onRemove, onClose } = $props();
	let url = $state(initialUrl);
	let input = $state();
	$effect(() => { input?.focus(); });
	function submit() { onSave(url); }
	function keydown(e) {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
	}
</script>

<div class="bg-popover border-border flex items-center gap-1 rounded-md border p-1 shadow-lg" role="dialog" aria-label="Editar enlace">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:this={input}
		bind:value={url}
		onkeydown={keydown}
		onmousedown={(e) => e.stopPropagation()}
		placeholder="Pegá o escribí una URL"
		aria-label="URL del enlace"
		class="bg-background text-foreground h-8 w-56 rounded-sm px-2 text-sm outline-none"
	/>
	<button type="button" onmousedown={(e) => e.preventDefault()} onclick={submit} class="text-primary h-8 rounded-sm px-2 text-sm">Guardar</button>
	{#if initialUrl}
		<button type="button" onmousedown={(e) => e.preventDefault()} onclick={onRemove} class="text-destructive h-8 rounded-sm px-2 text-sm">Quitar</button>
	{/if}
</div>
