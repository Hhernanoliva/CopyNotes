<script>
	import { TEXT_COLORS } from '$lib/format';
	let { current = null, onPick, onClose } = $props();
	// stopPropagation es esencial: la barra escucha Escape en `window` para
	// cerrarse entera. Sin cortar acá, un solo Escape cerraba la paleta Y la
	// barra, y no había forma de volver a la fila de botones.
	function keydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="bg-popover border-border flex gap-1 rounded-md border p-1 shadow-lg" role="menu" tabindex="-1" aria-label="Color de texto" data-cn-toolbar-group="panel" onkeydown={keydown}>
	{#each TEXT_COLORS as color}
		<button
			type="button"
			role="menuitemradio"
			aria-checked={current === color.className}
			aria-label={color.label}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onPick(color.className)}
			class="cn-touch-control focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm border focus-visible:ring-2 focus-visible:outline-none {current === color.className ? 'border-foreground' : 'border-border'}"
		>
			<span class="text-base leading-none {color.className ?? ''}">{color.id === 'default' ? '⦸' : 'A'}</span>
		</button>
	{/each}
</div>
