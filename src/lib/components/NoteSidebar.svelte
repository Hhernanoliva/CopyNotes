<script>
	import { DatabaseBackup, Plus, Star, Trash2, ArrowDownToLine, FileDown } from '@lucide/svelte';

	let {
		notes,
		snippets = [],
		currentNoteId,
		open,
		view = $bindable('notes'),
		onSelect,
		onCreate,
		onClose,
		onBackup,
		onNewSnippet,
		onToggleFavorite,
		onInsertSnippet,
		onDeleteSnippet,
		onExportSnippets
	} = $props();

	// Escape closes the sidebar only when it behaves as a mobile overlay.
	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && open && !window.matchMedia('(min-width: 768px)').matches) {
			onClose();
		}
	}

	function firstLine(text) {
		return (text ?? '').split('\n')[0];
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<!-- Mobile backdrop; the sidebar is a near full-screen panel below md -->
	<button
		type="button"
		aria-label="Cerrar navegación"
		onclick={onClose}
		class="bg-overlay fixed inset-0 z-30 md:hidden"
	></button>
	<aside
		class="bg-sidebar border-border fixed inset-y-0 left-0 z-40 flex w-[85%] max-w-xs flex-col border-r md:static md:z-auto md:w-[270px] md:max-w-none"
	>
		<div class="flex h-12 shrink-0 items-center justify-between border-b px-3">
			<div class="bg-muted flex rounded-md p-0.5" role="group" aria-label="Sección de la barra lateral">
				<button
					type="button"
					aria-pressed={view === 'notes'}
					onclick={() => (view = 'notes')}
					class="focus-visible:ring-ring rounded-[5px] px-2.5 py-1 text-xs font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {view ===
					'notes'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Notas
				</button>
				<button
					type="button"
					aria-pressed={view === 'snippets'}
					onclick={() => (view = 'snippets')}
					class="focus-visible:ring-ring rounded-[5px] px-2.5 py-1 text-xs font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {view ===
					'snippets'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Snippets
				</button>
			</div>
			<button
				type="button"
				onclick={view === 'notes' ? onCreate : onNewSnippet}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
				aria-label={view === 'notes' ? 'Nueva nota' : 'Nuevo snippet'}
				title={view === 'notes' ? 'Nueva nota' : 'Nuevo snippet'}
			>
				<Plus size={18} aria-hidden="true" />
			</button>
		</div>

		{#if view === 'notes'}
			<nav aria-label="Lista de notas" class="flex-1 overflow-y-auto overscroll-contain p-2">
				{#if notes.length === 0}
					<p class="text-faint px-2 py-3 text-sm">Todavía no hay notas.</p>
				{:else}
					<ul class="flex flex-col gap-0.5">
						{#each notes as note (note.id)}
							<li>
								<button
									type="button"
									onclick={() => onSelect(note.id)}
									aria-current={currentNoteId === note.id ? 'page' : undefined}
									class="hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) w-full items-center rounded-md px-2 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none md:min-h-9 {currentNoteId ===
									note.id
										? 'bg-accent text-foreground'
										: 'text-muted-foreground'}"
								>
									{#if note.title}
										{note.title}
									{:else}
										<span class="text-faint">Sin título</span>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</nav>
		{:else}
			<section aria-label="Biblioteca de snippets" class="flex-1 overflow-y-auto overscroll-contain p-2">
				{#if snippets.length === 0}
					<p class="text-faint px-2 py-3 text-sm">
						Todavía no guardaste snippets. Pasá el mouse por un bloque de tu nota y tocá el
						marcador para guardar el primero.
					</p>
				{:else}
					<ul class="flex flex-col gap-0.5">
						{#each snippets as snippet (snippet.id)}
							<li class="group hover:bg-accent flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors duration-(--motion-fast)">
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm">{snippet.name}</p>
									{#if firstLine(snippet.content) && firstLine(snippet.content) !== snippet.name}
										<p class="text-faint truncate text-xs">{firstLine(snippet.content)}</p>
									{/if}
								</div>
								<div class="flex shrink-0 items-center">
									<button
										type="button"
										aria-label={snippet.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
										aria-pressed={snippet.isFavorite}
										title={snippet.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
										onclick={() => onToggleFavorite(snippet)}
										class="text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm transition-opacity duration-(--motion-fast) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none {snippet.isFavorite
											? 'text-foreground opacity-100'
											: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}"
									>
										<Star size={14} aria-hidden="true" class={snippet.isFavorite ? 'fill-current' : ''} />
									</button>
									<button
										type="button"
										aria-label="Insertar en la nota"
										title="Insertar en la nota"
										onclick={() => onInsertSnippet(snippet)}
										class="text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
									>
										<ArrowDownToLine size={14} aria-hidden="true" />
									</button>
									<button
										type="button"
										aria-label="Borrar snippet"
										title="Borrar snippet"
										onclick={() => onDeleteSnippet(snippet)}
										class="text-faint hover:text-destructive focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
									>
										<Trash2 size={14} aria-hidden="true" />
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<div class="border-border shrink-0 border-t p-2">
			{#if view === 'snippets' && snippets.length > 0}
				<button
					type="button"
					onclick={onExportSnippets}
					class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex min-h-(--touch-target) w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none md:min-h-9"
				>
					<FileDown size={16} aria-hidden="true" />
					Exportar snippets
				</button>
			{/if}
			<button
				type="button"
				onclick={onBackup}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex min-h-(--touch-target) w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none md:min-h-9"
			>
				<DatabaseBackup size={16} aria-hidden="true" />
				Respaldo
			</button>
		</div>
	</aside>
{/if}
