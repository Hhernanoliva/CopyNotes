<script>
	import { resolveQuickOption, todayString } from '$lib/dates';

	let { hasDate = false, onPick, onRemove, onClose } = $props();

	let firstEl = $state();
	let panelEl = $state();
	$effect(() => { firstEl?.focus(); });

	function pickQuick(option) { onPick(resolveQuickOption(option, todayString())); }
	function keydown(e) {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		// Inside the date input the arrows edit the date segments — leave them alone.
		if (document.activeElement?.tagName === 'INPUT') return;
		// Roving focus through the panel's options; stop the editor's own
		// arrow navigation from moving the caret behind the open panel.
		e.preventDefault();
		e.stopPropagation();
		const items = [...panelEl.querySelectorAll('button, input')];
		const index = items.indexOf(document.activeElement);
		const delta = e.key === 'ArrowDown' ? 1 : -1;
		items[(index + delta + items.length) % items.length]?.focus();
	}

	const restOptions = [
		['tomorrow', 'Mañana'],
		['next-week', 'Próxima semana']
	];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={panelEl}
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
