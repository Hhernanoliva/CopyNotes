<script>
	let { initialUrl = '', onSave, onRemove, onClose } = $props();
	// El popover se monta de nuevo en cada apertura ({#if} en FloatingFormattingToolbar),
	// así que capturar solo el valor inicial es intencional.
	// svelte-ignore state_referenced_locally
	let url = $state(initialUrl);
	let input = $state();
	$effect(() => { input?.focus(); });
	function submit() { onSave(url); }
	function keydown(e) {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
	}
</script>

<div class="bg-popover border-border flex w-[calc(100vw-1rem)] max-w-[22rem] items-center gap-1 rounded-md border p-1 shadow-lg" role="dialog" aria-label="Editar enlace">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:this={input}
		bind:value={url}
		onkeydown={keydown}
		onmousedown={(e) => e.stopPropagation()}
		placeholder="Pegá o escribí una URL"
		aria-label="URL del enlace"
		class="cn-touch-row bg-background text-foreground focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-sm px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
	/>
	<button type="button" onmousedown={(e) => e.preventDefault()} onclick={submit} class="cn-touch-row text-primary focus-visible:ring-ring h-8 rounded-sm px-2 text-sm focus-visible:ring-2 focus-visible:outline-none">Guardar</button>
	{#if initialUrl}
		<button type="button" onmousedown={(e) => e.preventDefault()} onclick={onRemove} class="cn-touch-row text-destructive focus-visible:ring-ring h-8 rounded-sm px-2 text-sm focus-visible:ring-2 focus-visible:outline-none">Quitar</button>
	{/if}
</div>
