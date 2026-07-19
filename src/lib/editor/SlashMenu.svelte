<script>
	import { Type, List, SquareCheck, Code, Minus, Bookmark, Star, CalendarDays } from '@lucide/svelte';

	let { commands, selectedIndex, onSelect, emptyLabel = 'Sin resultados' } = $props();

	let listEl = $state();
	const headingCommands = $derived(commands.filter((command) => command.id.startsWith('heading')));
	const firstHeadingIndex = $derived(
		commands.findIndex((command) => command.id.startsWith('heading'))
	);

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
		date: CalendarDays,
		code: Code,
		separator: Minus,
		snippet: Bookmark
	};

	function iconFor(command) {
		if (command.kind === 'snippet') return command.isFavorite ? Star : Bookmark;
		return icons[command.id] ?? Type;
	}

	function isHeading(command) {
		return command.id.startsWith('heading');
	}
</script>

<!-- One option button for both layouts (heading badge and full row) so the
     role/id/aria/pointerdown wiring can never drift between the two. -->
{#snippet optionButton(command, optionIndex, layout, body)}
	<button
		type="button"
		role="option"
		id="slash-option-{command.id}"
		aria-label={command.label}
		aria-selected={optionIndex === selectedIndex}
		onpointerdown={(event) => {
			event.preventDefault();
			onSelect(command);
		}}
		class="focus-visible:ring-ring rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {layout} {optionIndex ===
		selectedIndex
			? 'bg-accent text-foreground'
			: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
	>
		{@render body(command)}
	</button>
{/snippet}

{#snippet headingBody(heading)}
	<span aria-hidden="true" translate="no">H{heading.id.slice(-1)}</span>
{/snippet}

{#snippet commandBody(command)}
	{@const Icon = iconFor(command)}
	<Icon
		size={15}
		aria-hidden="true"
		class={command.kind === 'snippet' && command.isFavorite ? 'fill-current' : ''}
	/>
	<span class="truncate">{command.label}</span>
{/snippet}

<div
	bind:this={listEl}
	role="listbox"
	id="slash-menu"
	aria-label={commands.some((command) => command.kind === 'snippet')
		? 'Snippets guardados'
		: 'Tipos de bloque'}
	class="cn-pop bg-popover border-border absolute top-full left-8 z-10 mt-1 max-h-[min(24rem,70dvh)] w-52 overflow-y-auto overscroll-contain rounded-md border p-1 shadow-md"
>
	{#if commands.length === 0}
		<p class="text-muted-foreground px-2 py-1.5 text-sm">{emptyLabel}</p>
	{:else}
		{#each commands as command, index (command.id)}
			{#if isHeading(command)}
				{#if index === firstHeadingIndex}
					<div role="group" aria-label="Títulos" class="flex min-h-8 items-center gap-2 px-2 py-1">
						<Type size={15} aria-hidden="true" class="text-muted-foreground shrink-0" />
						<span class="text-muted-foreground min-w-0 flex-1 text-sm">Títulos</span>
						<div class="flex shrink-0 gap-0.5">
							{#each headingCommands as heading (heading.id)}
								{@render optionButton(
									heading,
									commands.indexOf(heading),
									'flex h-8 min-w-8 items-center justify-center px-1 text-xs font-bold',
									headingBody
								)}
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				{@render optionButton(
					command,
					index,
					'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
					commandBody
				)}
			{/if}
		{/each}
	{/if}
</div>
