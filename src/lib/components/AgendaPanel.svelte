<script>
	import { Check } from '@lucide/svelte';
	import { badgeLabel, groupForAgenda, todayString } from '$lib/dates';
	import {
		getAgendaHideCompleted,
		listDatedBlocks,
		listNotes,
		setAgendaHideCompleted,
		updateBlock
	} from '$lib/storage';

	let { onOpen, onDataChanged } = $props();

	let groups = $state([]);
	let titles = $state({});
	let hideCompleted = $state(false);
	let loaded = $state(false);

	async function refresh() {
		const [blocks, notes, hide] = await Promise.all([
			listDatedBlocks(),
			listNotes(),
			getAgendaHideCompleted()
		]);
		titles = Object.fromEntries(notes.map((note) => [note.id, note.title]));
		groups = groupForAgenda(blocks, todayString());
		hideCompleted = hide;
		loaded = true;
	}

	$effect(() => {
		refresh();
	});

	async function toggleTodo(block) {
		await updateBlock(block.id, { checked: !block.checked });
		await refresh();
		onDataChanged();
	}

	async function toggleHideCompleted() {
		hideCompleted = !hideCompleted;
		await setAgendaHideCompleted(hideCompleted);
	}

	function visibleItems(group) {
		return hideCompleted
			? group.items.filter((item) => !(item.type === 'todo' && item.checked))
			: group.items;
	}

	function firstLine(block) {
		return (block.content ?? '').split('\n')[0] || 'Sin texto';
	}

	const hasVisibleItems = $derived(groups.some((group) => visibleItems(group).length > 0));
</script>

<div class="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2" aria-label="Agenda">
	{#if loaded && groups.length === 0}
		<p class="text-faint px-2 py-3 text-sm">
			Nada agendado. Escribí «/fecha» en cualquier renglón de una nota para ponerle fecha.
		</p>
	{:else if loaded}
		<label class="text-muted-foreground flex items-center gap-2 px-2 py-1 text-xs">
			<!-- Padded wrapper widens the tap target beyond the visible 16px box, same pattern as the todo checkbox in the editor. -->
			<button
				type="button"
				role="checkbox"
				aria-checked={hideCompleted}
				aria-label="Ocultar completadas"
				onclick={toggleHideCompleted}
				class="focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<span
					aria-hidden="true"
					class="border-border flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--motion-fast) {hideCompleted
						? 'bg-primary border-primary text-primary-foreground'
						: 'bg-transparent'}"
				>
					{#if hideCompleted}
						<Check size={12} />
					{/if}
				</span>
			</button>
			Ocultar completadas
		</label>
		{#if hasVisibleItems}
			{#each groups as group (group.id)}
				{@const items = visibleItems(group)}
				{#if items.length > 0}
					<section aria-label={group.label}>
						<h3
							class="{group.id === 'overdue'
								? 'text-destructive'
								: 'text-muted-foreground'} px-2 pt-2 pb-1 text-xs font-bold tracking-wide uppercase"
						>
							{group.label}
						</h3>
						<ul class="flex flex-col gap-0.5">
							{#each items as item (item.id)}
								<li
									class="group hover:bg-accent flex items-center gap-1 rounded-md pr-1 transition-colors duration-(--motion-fast)"
								>
									{#if item.type === 'todo'}
										<button
											type="button"
											role="checkbox"
											aria-checked={item.checked}
											aria-label={item.checked ? 'Desmarcar tarea' : 'Marcar tarea'}
											onclick={() => toggleTodo(item)}
											class="focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
										>
											<span
												aria-hidden="true"
												class="border-border flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--motion-fast) {item.checked
													? 'bg-primary border-primary text-primary-foreground'
													: 'bg-transparent'}"
											>
												{#if item.checked}
													<Check size={12} />
												{/if}
											</span>
										</button>
									{/if}
									<button
										type="button"
										onclick={() => onOpen(item.noteId, item.id)}
										class="focus-visible:ring-ring flex min-h-(--touch-target) min-w-0 flex-1 flex-col justify-center rounded-md px-2 text-left md:min-h-9 focus-visible:ring-2 focus-visible:outline-none"
									>
										<span
											class="truncate text-sm {item.type === 'todo' && item.checked
												? 'text-muted-foreground line-through'
												: 'text-foreground'}"
										>
											{firstLine(item)}
										</span>
										<span class="text-faint truncate text-xs">
											{titles[item.noteId] || 'Sin título'} · 📅 {badgeLabel(item.dueDate, todayString())}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		{:else}
			<p class="text-faint px-2 py-3 text-sm">
				Todo lo agendado está completado y oculto.
			</p>
		{/if}
	{/if}
</div>
