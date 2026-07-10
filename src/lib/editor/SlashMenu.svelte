<script>
	import { Type, List, SquareCheck, Code, Minus, Bookmark, Star } from '@lucide/svelte';

	let { commands, selectedIndex, onSelect, emptyLabel = 'Sin resultados' } = $props();

	let listEl = $state();

	// With many snippets the menu scrolls; keep the keyboard-selected option visible.
	$effect(() => {
		const selected = commands[selectedIndex];
		if (listEl && selected) {
			const option = listEl.querySelector(`[id="slash-option-${selected.id}"]`);
			if (option) option.scrollIntoView({ block: 'nearest' });
		}
	});

	const icons = {
		text: Type,
		bullet: List,
		todo: SquareCheck,
		code: Code,
		separator: Minus,
		snippet: Bookmark
	};

	function iconFor(command) {
		if (command.kind === 'snippet') return command.isFavorite ? Star : Bookmark;
		return icons[command.id] ?? Type;
	}
</script>

<div
	bind:this={listEl}
	role="listbox"
	id="slash-menu"
	aria-label={commands.some((command) => command.kind === 'snippet')
		? 'Snippets guardados'
		: 'Tipos de bloque'}
	class="bg-popover border-border absolute top-full left-8 z-10 mt-1 max-h-64 w-52 overflow-y-auto rounded-md border p-1 shadow-md"
>
	{#if commands.length === 0}
		<p class="text-muted-foreground px-2 py-1.5 text-sm">{emptyLabel}</p>
	{:else}
		{#each commands as command, index (command.id)}
			{@const Icon = iconFor(command)}
			<button
				type="button"
				role="option"
				id="slash-option-{command.id}"
				aria-selected={index === selectedIndex}
				onpointerdown={(event) => {
					event.preventDefault();
					onSelect(command);
				}}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) {index ===
				selectedIndex
					? 'bg-accent text-foreground'
					: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
			>
				<Icon
					size={15}
					aria-hidden="true"
					class={command.kind === 'snippet' && command.isFavorite ? 'fill-current' : ''}
				/>
				<span class="truncate">{command.label}</span>
			</button>
		{/each}
	{/if}
</div>
