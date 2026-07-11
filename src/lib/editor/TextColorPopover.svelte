<script>
	import { TEXT_COLORS } from '$lib/format';
	let { current = null, onPick, onClose } = $props();
	function keydown(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="bg-popover border-border flex gap-1 rounded-md border p-1 shadow-lg" role="menu" aria-label="Color de texto" onkeydown={keydown}>
	{#each TEXT_COLORS as color}
		<button
			type="button"
			role="menuitemradio"
			aria-checked={current === color.className}
			aria-label={color.label}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onPick(color.className)}
			class="flex size-7 items-center justify-center rounded-sm border {current === color.className ? 'border-foreground' : 'border-border'}"
		>
			<span class="text-base leading-none {color.className ?? ''}">{color.id === 'default' ? '⦸' : 'A'}</span>
		</button>
	{/each}
</div>
