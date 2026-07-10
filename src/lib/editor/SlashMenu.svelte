<script>
	import { Type, List, SquareCheck, Code, Minus } from '@lucide/svelte';

	let { commands, selectedIndex, onSelect } = $props();

	const icons = { text: Type, bullet: List, todo: SquareCheck, code: Code, separator: Minus };
</script>

<div
	role="listbox"
	aria-label="Tipos de bloque"
	class="bg-popover border-border absolute top-full left-8 z-10 mt-1 w-52 rounded-md border p-1 shadow-md"
>
	{#if commands.length === 0}
		<p class="text-muted-foreground px-2 py-1.5 text-sm">Sin resultados</p>
	{:else}
		{#each commands as command, index (command.id)}
			{@const Icon = icons[command.id]}
			<button
				type="button"
				role="option"
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
				<Icon size={15} aria-hidden="true" />
				{command.label}
			</button>
		{/each}
	{/if}
</div>
