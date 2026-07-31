<script>
	import { Type, List, SquareCheck, Code, Minus, Bookmark, Star, CalendarDays } from '@lucide/svelte';
	import { keyboardInset } from '$lib/actions/keyboardInset';
	import { tapSelect } from '$lib/actions/tapSelect';

	let { commands, selectedIndex, onSelect, emptyLabel = 'Sin resultados', title = '' } = $props();

	let listEl = $state();
	const headingCommands = $derived(commands.filter((command) => command.id.startsWith('heading')));
	const firstHeadingIndex = $derived(
		commands.findIndex((command) => command.id.startsWith('heading'))
	);

	// El modo snippets se reconoce por el tipo de las opciones; en celular es la
	// única disposición que sigue siendo vertical (los nombres son largos y
	// pueden ser muchos: en una fila no se pueden leer de un vistazo).
	const isSnippets = $derived(commands.some((command) => command.kind === 'snippet'));

	// Escritorio: lista vertical, igual que siempre. Abajo de 768px (max-md):
	// comandos = fichas anchas en una fila que se desliza; snippets = lista de
	// ancho completo con tope de alto.
	const rowLayout = $derived(
		isSnippets
			? 'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm max-md:min-h-11'
			: 'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm max-md:min-h-11 max-md:w-auto max-md:shrink-0 max-md:px-3'
	);

	// With many snippets the menu scrolls; keep the keyboard-selected option visible.
	$effect(() => {
		const selected = commands[selectedIndex];
		if (listEl && selected) {
			const option = listEl.querySelector(`[id="slash-option-${selected.id}"]`);
			if (option) option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
     role/id/aria/tap-select wiring can never drift between the two. -->
{#snippet optionButton(command, optionIndex, layout, body)}
	<button
		type="button"
		role="option"
		id="slash-option-{command.id}"
		aria-label={command.label}
		aria-selected={optionIndex === selectedIndex}
		use:tapSelect={() => onSelect(command)}
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

<!-- ponytail: en celular la barra tapa unos 56px al pie, así que escribiendo en
     el último renglón visible puede quedar sobre el texto. Si molesta en uso
     real, empujar el renglón con scrollIntoView al abrir el menú.
     ponytail: los avisos flotantes (Toaster, bottom-center) caen en el mismo
     lugar y quedan encima; mientras dura el aviso (1,8s) un toque puede darle
     al aviso en vez de a la opción. Si molesta, mover los avisos arriba en
     celular. -->
<div
	bind:this={listEl}
	use:keyboardInset
	onpointerdown={(event) => event.stopPropagation()}
	tabindex="-1"
	role="listbox"
	id="slash-menu"
	aria-label={title || (isSnippets ? 'Snippets guardados' : 'Tipos de bloque')}
	class="cn-pop bg-popover border-border absolute top-full left-8 z-10 mt-1 max-h-[min(24rem,70dvh)] w-52 overflow-y-auto overscroll-contain rounded-md border p-1 shadow-md max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:z-30 max-md:mt-0 max-md:w-full max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:p-2 {isSnippets
		? 'max-md:max-h-[40dvh]'
		: 'max-md:flex max-md:max-h-none max-md:items-stretch max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden'}"
>
	<!-- Solo lo usa el menú de grupo (spec 031). Oculto abajo de 768px: ahí el
	     menú es una barra horizontal y un título la desarmaría — y la selección
	     de varios renglones es gesto de mouse/teclado, no de celular. -->
	{#if title}
		<p
			aria-hidden="true"
			class="text-muted-foreground border-border mb-1 border-b px-2 py-1 text-xs max-md:hidden"
		>
			{title}
		</p>
	{/if}
	{#if commands.length === 0}
		<p class="text-muted-foreground px-2 py-1.5 text-sm">{emptyLabel}</p>
	{:else}
		{#each commands as command, index (command.id)}
			{#if isHeading(command)}
				{#if index === firstHeadingIndex}
					<div
						role="group"
						aria-label="Títulos"
						class="flex min-h-8 items-center gap-2 px-2 py-1 max-md:min-h-11 max-md:shrink-0"
					>
						<Type size={15} aria-hidden="true" class="text-muted-foreground shrink-0" />
						<span class="text-muted-foreground min-w-0 flex-1 text-sm">Títulos</span>
						<div class="flex shrink-0 gap-0.5">
							{#each headingCommands as heading (heading.id)}
								{@render optionButton(
									heading,
									commands.indexOf(heading),
									'flex h-8 min-w-8 items-center justify-center px-1 text-xs font-bold max-md:h-11 max-md:min-w-11',
									headingBody
								)}
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				{@render optionButton(command, index, rowLayout, commandBody)}
			{/if}
		{/each}
	{/if}
</div>
