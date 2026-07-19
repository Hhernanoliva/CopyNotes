<script>
	import { Search, X, FileText, List, SquareCheck, Code, Bookmark } from '@lucide/svelte';
	import {
		listNotes,
		listAllBlocks,
		listSnippets,
		listTags,
		listAllAssignments
	} from '$lib/storage';
	import { searchAll, buildTagsByTarget, highlightSegments } from '$lib/search';

	let { open = $bindable(false), onOpenNote, initialQuery = '' } = $props();

	let dialogEl = $state(null);
	let text = $state('');
	let selectedTagIds = $state([]);
	let allTags = $state([]);
	// The whole live dataset, loaded once when the panel opens. Small app,
	// local data: searching in memory keeps results instant.
	let dataset = $state(null);
	let inputEl = $state();

	const blockIcons = { text: FileText, bullet: List, todo: SquareCheck, code: Code, separator: List };

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			text = initialQuery ?? '';
			selectedTagIds = [];
			dialogEl.showModal();
			loadData();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	async function loadData() {
		const [notes, blocks, snippets, tags, assignments] = await Promise.all([
			listNotes(),
			listAllBlocks(),
			listSnippets(),
			listTags(),
			listAllAssignments()
		]);
		allTags = tags;
		dataset = { notes, blocks, snippets, tagsByTarget: buildTagsByTarget(assignments) };
	}

	const results = $derived.by(() => {
		if (!dataset) return { notes: [], blocks: [], snippets: [] };
		return searchAll(dataset, { text, tagIds: selectedTagIds });
	});

	const hasQuery = $derived(text.trim().length > 0 || selectedTagIds.length > 0);
	const total = $derived(results.notes.length + results.blocks.length + results.snippets.length);

	const noteTitleById = $derived.by(() => {
		const map = {};
		for (const note of dataset?.notes ?? []) map[note.id] = note.title;
		return map;
	});

	function toggleTag(id) {
		selectedTagIds = selectedTagIds.includes(id)
			? selectedTagIds.filter((tagId) => tagId !== id)
			: [...selectedTagIds, id];
	}

	function openNote(noteId) {
		onOpenNote(noteId);
		open = false;
	}

	function noteLabel(noteId) {
		const title = noteTitleById[noteId];
		return title && title.trim() ? title : 'Sin título';
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-label="Buscar"
	class="cn-dialog bg-background text-foreground border-border mx-auto mt-[8vh] mb-auto max-h-[80svh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="border-border flex items-center gap-2 border-b px-3">
		<Search size={18} aria-hidden="true" class="text-muted-foreground shrink-0" />
		<!-- svelte-ignore a11y_autofocus — the panel exists to type a query. -->
		<input
			bind:this={inputEl}
			bind:value={text}
			autofocus
			autocomplete="off"
			placeholder="Buscar en notas, bloques y snippets…"
			aria-label="Texto a buscar"
			class="placeholder:text-faint min-h-(--touch-target) w-full bg-transparent text-base outline-none"
		/>
		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Cerrar búsqueda"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) shrink-0 items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={16} aria-hidden="true" />
		</button>
	</div>

	{#if allTags.length > 0}
		<div class="border-border flex flex-wrap gap-1.5 border-b px-3 py-2">
			{#each allTags as tag (tag.id)}
				<button
					type="button"
					aria-pressed={selectedTagIds.includes(tag.id)}
					onclick={() => toggleTag(tag.id)}
					class="focus-visible:ring-ring rounded-full px-2 py-0.5 text-xs transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {selectedTagIds.includes(
						tag.id
					)
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					#{tag.name}
				</button>
			{/each}
		</div>
	{/if}

	<div class="max-h-[52svh] overflow-y-auto overscroll-contain px-2 py-2">
		{#if !hasQuery}
			<p class="text-faint px-2 py-6 text-center text-sm">
				Buscá en tus notas, bloques y snippets. Elegí etiquetas para filtrar.
			</p>
		{:else if total === 0}
			<p class="text-faint px-2 py-6 text-center text-sm">
				Nada coincide con tu búsqueda.
			</p>
		{:else}
			{#if results.notes.length > 0}
				<h2 class="text-muted-foreground px-2 pt-1 pb-1 text-xs font-bold tracking-wide uppercase">
					Notas
				</h2>
				<ul class="mb-2 flex flex-col gap-0.5">
					{#each results.notes as note (note.id)}
						<li>
							<button
								type="button"
								onclick={() => openNote(note.id)}
								class="hover:bg-accent focus-visible:ring-ring flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
							>
								<FileText size={15} aria-hidden="true" class="text-faint shrink-0" />
								<span class="truncate">
									{#each highlightSegments(noteLabel(note.id), text) as seg (seg)}<span
											class={seg.match ? 'text-foreground font-bold' : ''}>{seg.text}</span
										>{/each}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if results.blocks.length > 0}
				<h2 class="text-muted-foreground px-2 pt-1 pb-1 text-xs font-bold tracking-wide uppercase">
					Bloques
				</h2>
				<ul class="mb-2 flex flex-col gap-0.5">
					{#each results.blocks as block (block.id)}
						{@const Icon = blockIcons[block.type] ?? FileText}
						<li>
							<button
								type="button"
								onclick={() => openNote(block.noteId)}
								class="hover:bg-accent focus-visible:ring-ring flex min-h-9 w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
							>
								<Icon size={15} aria-hidden="true" class="text-faint mt-0.5 shrink-0" />
								<span class="min-w-0 flex-1">
									<span class="line-clamp-2 break-words">
										{#each highlightSegments(block.content, text) as seg (seg)}<span
												class={seg.match ? 'text-foreground font-bold' : ''}>{seg.text}</span
											>{/each}
									</span>
									<span class="text-faint block truncate text-xs">en {noteLabel(block.noteId)}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if results.snippets.length > 0}
				<h2 class="text-muted-foreground px-2 pt-1 pb-1 text-xs font-bold tracking-wide uppercase">
					Snippets
				</h2>
				<ul class="flex flex-col gap-0.5">
					{#each results.snippets as snippet (snippet.id)}
						<li>
							<div
								class="flex min-h-9 w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm"
							>
								<Bookmark size={15} aria-hidden="true" class="text-faint mt-0.5 shrink-0" />
								<span class="min-w-0 flex-1">
									<span class="block truncate">
										{#each highlightSegments(snippet.name, text) as seg (seg)}<span
												class={seg.match ? 'text-foreground font-bold' : ''}>{seg.text}</span
											>{/each}
									</span>
									{#if snippet.content}
										<span class="text-faint block truncate text-xs">
											{#each highlightSegments(snippet.content.split('\n')[0], text) as seg (seg)}<span
													class={seg.match ? 'text-muted-foreground' : ''}>{seg.text}</span
												>{/each}
										</span>
									{/if}
								</span>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</dialog>
