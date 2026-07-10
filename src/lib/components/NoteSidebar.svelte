<script>
	import { Plus } from '@lucide/svelte';

	let { notes, currentNoteId, open, onSelect, onCreate, onClose } = $props();

	// Escape closes the sidebar only when it behaves as a mobile overlay.
	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && open && !window.matchMedia('(min-width: 768px)').matches) {
			onClose();
		}
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
			<span class="text-muted-foreground text-sm font-bold">Notas</span>
			<button
				type="button"
				onclick={onCreate}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
				aria-label="Nueva nota"
				title="Nueva nota"
			>
				<Plus size={18} aria-hidden="true" />
			</button>
		</div>
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
	</aside>
{/if}
