<script>
	import { resolveQuickOption, todayString } from '$lib/dates';

	let { hasDate = false, onPick, onRemove, onClose } = $props();

	let firstEl = $state();
	$effect(() => { firstEl?.focus(); });

	function pickQuick(option) { onPick(resolveQuickOption(option, todayString())); }
	function keydown(e) {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
	}

	const restOptions = [
		['tomorrow', 'Mañana'],
		['next-week', 'Próxima semana']
	];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="dialog"
	aria-label="Fecha del renglón"
	tabindex="-1"
	onkeydown={keydown}
	onmousedown={(e) => e.stopPropagation()}
	class="bg-popover border-border flex w-56 flex-col gap-0.5 rounded-md border p-1 shadow-lg"
>
	<button
		bind:this={firstEl}
		type="button"
		onclick={() => pickQuick('today')}
		class="hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
	>Hoy</button>
	{#each restOptions as [option, label] (option)}
		<button
			type="button"
			onclick={() => pickQuick(option)}
			class="hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
		>{label}</button>
	{/each}
	<label class="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-sm">
		Elegir día
		<input
			type="date"
			aria-label="Elegir día"
			onchange={(e) => { if (e.currentTarget.value) onPick(e.currentTarget.value); }}
			class="bg-background text-foreground min-w-0 flex-1 rounded-sm px-1 text-sm outline-none"
		/>
	</label>
	{#if hasDate}
		<button
			type="button"
			onclick={onRemove}
			class="text-destructive hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
		>Quitar fecha</button>
	{/if}
</div>
