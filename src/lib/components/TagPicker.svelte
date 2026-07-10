<script>
	import { Check, Plus } from '@lucide/svelte';
	import { filterTags, normalizeTagName, tagNamesMatch } from '$lib/tags';

	// One picker for notes, blocks and snippets: type to filter existing tags,
	// pick to toggle, or create the tag on the fly. The parent owns what
	// "pick" means (assign/unassign) and when to close.
	let { tags, assignedIds = [], onPick, onClose, align = 'left' } = $props();

	let query = $state('');
	let index = $state(0);
	let inputEl = $state();
	let rootEl = $state();

	// Every option carries the same keys; TS infers the literal's shape, so a
	// mixed-shape array would reject the create option (see project tsconfig notes).
	const options = $derived.by(() => {
		const filtered = filterTags(tags, query).map((tag) => ({
			kind: 'tag',
			id: tag.id,
			name: tag.name,
			tag,
			assigned: assignedIds.includes(tag.id)
		}));
		const clean = normalizeTagName(query);
		const exists = clean && tags.some((tag) => tagNamesMatch(tag.name, clean));
		if (clean && !exists) {
			filtered.push({ kind: 'create', id: '__create__', name: clean, tag: null, assigned: false });
		}
		return filtered;
	});

	$effect(() => {
		if (inputEl) inputEl.focus();
	});

	// Close when the user clicks anywhere outside the picker.
	$effect(() => {
		function handlePointerDown(event) {
			if (rootEl && !rootEl.contains(event.target)) onClose();
		}
		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	});

	function handleInput(event) {
		query = event.currentTarget.value;
		index = 0;
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (options.length === 0) return;
			const delta = event.key === 'ArrowDown' ? 1 : -1;
			index = (index + delta + options.length) % options.length;
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const option = options[index];
			if (option) {
				onPick(option);
				query = '';
				index = 0;
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		}
	}
</script>

<div
	bind:this={rootEl}
	class="bg-popover border-border absolute top-full z-20 mt-1 w-60 rounded-md border p-1 shadow-md {align ===
	'right'
		? 'right-0'
		: 'left-0'}"
>
	<input
		bind:this={inputEl}
		value={query}
		oninput={handleInput}
		onkeydown={handleKeydown}
		placeholder="Buscar o crear etiqueta…"
		aria-label="Buscar o crear etiqueta"
		autocomplete="off"
		role="combobox"
		aria-expanded="true"
		aria-controls="tag-picker-list"
		aria-activedescendant={options[index] ? `tag-option-${options[index].id}` : undefined}
		class="placeholder:text-faint focus-visible:ring-ring mb-1 w-full rounded-sm bg-transparent px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
	/>
	<div role="listbox" id="tag-picker-list" aria-label="Etiquetas" class="max-h-56 overflow-y-auto">
		{#if options.length === 0}
			<p class="text-muted-foreground px-2 py-1.5 text-sm">Escribí para crear tu primera etiqueta.</p>
		{:else}
			{#each options as option, optionIndex (option.id)}
				<button
					type="button"
					role="option"
					id="tag-option-{option.id}"
					aria-selected={optionIndex === index}
					onpointerdown={(event) => {
						event.preventDefault();
						onPick(option);
						query = '';
						index = 0;
						inputEl.focus();
					}}
					class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) {optionIndex ===
					index
						? 'bg-accent text-foreground'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					{#if option.kind === 'create'}
						<Plus size={14} aria-hidden="true" />
						<span class="truncate">Crear «{option.name}»</span>
					{:else}
						<span class="text-faint" aria-hidden="true">#</span>
						<span class="truncate">{option.tag.name}</span>
						{#if option.assigned}
							<span class="sr-only">(ya asignada, elegila para quitarla)</span>
							<Check size={14} aria-hidden="true" class="ml-auto shrink-0" />
						{/if}
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>
