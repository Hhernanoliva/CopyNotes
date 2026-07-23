<script>
	import {
		Bookmark,
		CalendarDays,
		ChevronRight,
		DatabaseBackup,
		FileText,
		Folder,
		FolderPlus,
		Plus,
		Star,
		Trash2,
		FileDown,
		Pencil,
		Tag
	} from '@lucide/svelte';
	import { fade, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import AgendaPanel from './AgendaPanel.svelte';
	import { sidebarDragList } from './dnd';
	import { buildSidebarTree } from '$lib/organize';
	import { MOTION, motionDuration } from '$lib/motion';

	let {
		notes,
		snippets = [],
		tags = [],
		noteFolders = [],
		snippetFolders = [],
		currentNoteId,
		open,
		view = $bindable('notes'),
		onSelect,
		onCreate,
		onClose,
		onBackup,
		onDeleteNote,
		onNewSnippet,
		onToggleFavorite,
		onRenameSnippet,
		onDeleteSnippet,
		onExportSnippets,
		onCreateTag,
		onRenameTag,
		onDeleteTag,
		onReorder,
		onCreateFolder,
		onRenameFolder,
		onToggleFolder,
		onDeleteFolder,
		onOpenBlock,
		onDataChanged,
		agendaVersion = 0
	} = $props();

	const noteTree = $derived(buildSidebarTree(notes, noteFolders));
	const snippetTree = $derived(buildSidebarTree(snippets, snippetFolders));

	// Flatten the folder tree into the exact sibling <li> order the DOM already
	// renders (folder row, then its children when open, then root items). This
	// lets each row be the single keyed child of one {#each}, which is what
	// animate:flip requires (spec 024, Stage 6). DOM output is unchanged.
	function flattenTree(tree) {
		const rows = [];
		for (const node of tree) {
			if (node.kind === 'folder') {
				rows.push({ kind: 'folder', id: node.folder.id, node });
				if (!node.folder.collapsed) {
					for (const child of node.children) {
						rows.push({ kind: 'child', id: child.id, item: child });
					}
				}
			} else {
				rows.push({ kind: 'item', id: node.item.id, item: node.item });
			}
		}
		return rows;
	}
	const noteRows = $derived(flattenTree(noteTree));
	const snippetRows = $derived(flattenTree(snippetTree));

	// Row class helpers. animate:flip needs the <li> to be the each's sole
	// direct child (no {#if} wrapper), so kind-specific classes are computed
	// here instead of branching in the template.
	const FOLDER_LI =
		'group hover:bg-accent flex min-h-9 items-center gap-1 rounded-md pr-1 transition-colors duration-(--motion-fast)';
	function noteRowClass(row) {
		if (row.kind === 'folder') return FOLDER_LI;
		const nested = row.kind === 'child' ? 'pl-5 ' : '';
		const current = currentNoteId === row.item.id ? 'bg-accent' : '';
		return `group hover:bg-accent flex items-center gap-1 rounded-md pr-1 ${nested}transition-colors duration-(--motion-fast) ${current}`;
	}
	function snippetRowClass(row) {
		if (row.kind === 'folder') return FOLDER_LI;
		const nested = row.kind === 'child' ? 'pl-5 ' : '';
		return `group hover:bg-accent relative rounded-md px-2 py-1.5 ${nested}transition-colors duration-(--motion-fast)`;
	}

	// Four tabs no longer fit as full labels in the 270px sidebar; each shows
	// its icon and only the ACTIVE one adds its name (aria-label keeps the
	// accessible name stable for all of them).
	const VIEWS = [
		{ id: 'notes', label: 'Notas', icon: FileText },
		{ id: 'snippets', label: 'Snippets', icon: Bookmark },
		{ id: 'agenda', label: 'Agenda', icon: CalendarDays },
		{ id: 'tags', label: 'Etiquetas', icon: Tag }
	];

	// Local UI state: inline tag creation/rename and which snippet has the
	// tag picker open. Data itself lives in the page.
	let creatingTag = $state(false);
	let newTagName = $state('');
	let editingTagId = $state(null);
	let editingValue = $state('');
	let editingSnippetId = $state(null);
	let editingSnippetValue = $state('');
	let editingFolderId = $state(null);
	let editingFolderValue = $state('');

	let asideEl = $state();

	function isMobile() {
		return !window.matchMedia('(min-width: 768px)').matches;
	}

	// Quiet Motion (spec 024, Stage 2). The drawer only animates as a mobile
	// overlay; on desktop it is part of the flex layout, so sliding it would
	// shove the editor and move the cursor — keep desktop instant.
	function drawerFly() {
		if (!isMobile()) return { duration: 0 };
		return { x: -320, duration: motionDuration(MOTION.overlay) };
	}

	// List reorder settle (spec 024, Stage 6): rows glide to their new spot
	// after a drop. 150–180ms; reduce-motion collapses it to instant.
	function flipParams() {
		return { duration: motionDuration(170) };
	}

	// Escape closes the sidebar only when it behaves as a mobile overlay.
	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && open && isMobile()) {
			onClose();
		}
	}

	// Visible, tabbable controls inside the drawer, in DOM order.
	function focusables() {
		if (!asideEl) return [];
		return [...asideEl.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
			(node) => !node.disabled && node.offsetParent !== null
		);
	}

	// On mobile the drawer is a modal overlay: pull focus in when it opens and
	// return it to whatever opened it when it closes, so keyboard/screen-reader
	// users are not stranded behind the backdrop.
	$effect(() => {
		if (!asideEl || !isMobile()) return;
		const restoreTo = document.activeElement;
		focusables()[0]?.focus();
		return () => {
			if (restoreTo instanceof HTMLElement && document.body.contains(restoreTo)) restoreTo.focus();
		};
	});

	// Keep Tab cycling within the drawer while it is a mobile overlay.
	function trapTab(event) {
		if (event.key !== 'Tab' || !isMobile()) return;
		const items = focusables();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function firstLine(text) {
		return (text ?? '').split('\n')[0];
	}

	function handlePlus() {
		if (view === 'notes') onCreate();
		else if (view === 'snippets') onNewSnippet();
		else if (view === 'tags') creatingTag = !creatingTag;
	}

	async function createFolderFromMenu() {
		const folder = await onCreateFolder(view, 'Carpeta nueva');
		if (folder) startFolderRename(folder);
	}

	function startFolderRename(folder) {
		editingFolderId = folder.id;
		editingFolderValue = folder.name;
	}

	async function submitFolderRename(folder) {
		// Same guard as snippets: Escape nulls the id first, so the blur it
		// triggers must not save the discarded text.
		if (editingFolderId !== folder.id) return;
		editingFolderId = null;
		const value = editingFolderValue.trim();
		if (value && value !== folder.name) await onRenameFolder(folder, value);
	}

	async function submitNewTag() {
		if (newTagName.trim()) await onCreateTag(newTagName);
		newTagName = '';
		creatingTag = false;
	}

	function startRename(tag) {
		editingTagId = tag.id;
		editingValue = tag.name;
	}

	function startSnippetRename(snippet) {
		editingSnippetId = snippet.id;
		editingSnippetValue = snippet.name;
	}

	async function submitSnippetRename(snippet) {
		// Escape sets editingSnippetId to null first; the blur it triggers then
		// lands here and must NOT save the discarded text. Enter runs this once
		// while still editing; the follow-up blur is a no-op for the same reason.
		if (editingSnippetId !== snippet.id) return;
		editingSnippetId = null;
		const value = editingSnippetValue.trim();
		if (value && value !== snippet.name) await onRenameSnippet(snippet, value);
	}

	async function submitRename(tag) {
		const value = editingValue;
		editingTagId = null;
		if (value.trim() && value !== tag.name) await onRenameTag(tag, value);
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#snippet noteRowInner(note)}
	<button
			type="button"
			onclick={() => onSelect(note.id)}
			aria-current={currentNoteId === note.id ? 'page' : undefined}
			class="focus-visible:ring-ring flex min-h-(--touch-target) min-w-0 flex-1 items-center rounded-md px-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none md:min-h-9 {currentNoteId ===
			note.id
				? 'text-foreground'
				: 'text-muted-foreground'}"
		>
			{#if note.title}
				<span class="truncate">{note.title}</span>
			{:else}
				<span class="text-faint">Sin título</span>
			{/if}
		</button>
		<button
			type="button"
			aria-label="Borrar nota {note.title || 'sin título'}"
			title="Borrar nota"
			onclick={() => onDeleteNote(note.id)}
			class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-sm opacity-0 cn-touch-visible transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none md:size-7"
		>
			<Trash2 size={14} aria-hidden="true" />
		</button>
{/snippet}

{#snippet snippetRowInner(snippet)}
		<div class="flex items-center gap-1">
			<div class="min-w-0 flex-1">
				{#if editingSnippetId === snippet.id}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							submitSnippetRename(snippet);
						}}
					>
						<!-- svelte-ignore a11y_autofocus — the user just chose to rename. -->
						<input
							bind:value={editingSnippetValue}
							aria-label="Nuevo nombre del snippet"
							autocomplete="off"
							autofocus
							onkeydown={(event) => {
								if (event.key === 'Escape') editingSnippetId = null;
							}}
							onblur={() => submitSnippetRename(snippet)}
							class="border-border focus-visible:ring-ring min-h-7 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
						/>
					</form>
				{:else}
					<button
						type="button"
						aria-label="Renombrar snippet {snippet.name}"
						title="Renombrar"
						onclick={() => startSnippetRename(snippet)}
						class="focus-visible:ring-ring block w-full rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
					>
						<p class="truncate text-sm">{snippet.name}</p>
						{#if firstLine(snippet.content) && firstLine(snippet.content) !== snippet.name}
							<p class="text-faint truncate text-xs">{firstLine(snippet.content)}</p>
						{/if}
					</button>
				{/if}
			</div>
			<div class="flex shrink-0 items-center">
				<button
					type="button"
					aria-label={snippet.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
					aria-pressed={snippet.isFavorite}
					title={snippet.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
					onclick={() => onToggleFavorite(snippet)}
					class="text-faint hover:text-foreground focus-visible:ring-ring flex size-9 md:size-7 items-center justify-center rounded-sm transition-[opacity,transform] duration-(--motion-fast) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none active:scale-90 {snippet.isFavorite
						? 'text-foreground opacity-100'
						: 'opacity-0 cn-touch-visible group-focus-within:opacity-100 group-hover:opacity-100'}"
				>
					<Star size={14} aria-hidden="true" class={snippet.isFavorite ? 'fill-current' : ''} />
				</button>
				<button
					type="button"
					aria-label="Borrar snippet"
					title="Borrar snippet"
					onclick={() => onDeleteSnippet(snippet)}
					class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 md:size-7 items-center justify-center rounded-sm opacity-0 cn-touch-visible transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
				>
					<Trash2 size={14} aria-hidden="true" />
				</button>
			</div>
		</div>
{/snippet}

{#snippet folderRowInner(node, viewName)}
		<button
			type="button"
			aria-expanded={!node.folder.collapsed}
			aria-label="{node.folder.collapsed ? 'Abrir' : 'Cerrar'} carpeta {node.folder.name}"
			onclick={() => onToggleFolder(node.folder)}
			class="text-muted-foreground focus-visible:ring-ring flex min-h-9 flex-none items-center rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none"
		>
			<ChevronRight
				size={14}
				aria-hidden="true"
				class="transition-transform duration-(--motion-fast) {node.folder.collapsed ? '' : 'rotate-90'}"
			/>
			<Folder size={14} aria-hidden="true" class="ml-1" />
		</button>
		{#if editingFolderId === node.folder.id}
			<form
				class="flex-1"
				onsubmit={(event) => {
					event.preventDefault();
					submitFolderRename(node.folder);
				}}
			>
				<!-- svelte-ignore a11y_autofocus — the user just chose to rename. -->
				<input
					bind:value={editingFolderValue}
					aria-label="Nuevo nombre de la carpeta"
					autocomplete="off"
					autofocus
					onkeydown={(event) => {
						if (event.key === 'Escape') editingFolderId = null;
					}}
					onblur={() => submitFolderRename(node.folder)}
					class="border-border focus-visible:ring-ring min-h-7 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</form>
		{:else}
			<button
				type="button"
				aria-label="Renombrar carpeta {node.folder.name}"
				title="Renombrar"
				onclick={() => startFolderRename(node.folder)}
				class="focus-visible:ring-ring min-w-0 flex-1 truncate rounded-sm text-left text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
			>
				{node.folder.name}
				<span class="text-faint font-normal">({node.children.length})</span>
			</button>
			<button
				type="button"
				aria-label="Borrar carpeta {node.folder.name}"
				title="Borrar carpeta (el contenido vuelve a la lista)"
				onclick={() => onDeleteFolder(viewName, node.folder)}
				class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-sm opacity-0 cn-touch-visible transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none md:size-7"
			>
				<Trash2 size={14} aria-hidden="true" />
			</button>
		{/if}
{/snippet}

{#if open}
	<!-- Mobile backdrop; the sidebar is a near full-screen panel below md -->
	<button
		type="button"
		aria-label="Cerrar navegación"
		onclick={onClose}
		transition:fade={{ duration: motionDuration(MOTION.fast) }}
		class="bg-overlay fixed inset-0 z-30 md:hidden"
	></button>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions — the Tab-trap keydown keeps the mobile drawer modal -->
	<aside
		bind:this={asideEl}
		onkeydown={trapTab}
		transition:fly={drawerFly()}
		class="bg-sidebar border-border fixed inset-y-0 left-0 z-40 flex w-[85%] max-w-xs flex-col border-r md:static md:z-auto md:w-[270px] md:max-w-none"
	>
		<div class="flex h-12 shrink-0 items-center justify-between border-b px-3">
			<div class="bg-muted flex rounded-md p-0.5" role="group" aria-label="Sección de la barra lateral">
				{#each VIEWS as option (option.id)}
					{@const Icon = option.icon}
					<button
						type="button"
						aria-pressed={view === option.id}
						aria-label={option.label}
						title={view === option.id ? undefined : option.label}
						onclick={() => (view = option.id)}
						class="focus-visible:ring-ring flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none max-md:px-3 max-md:py-2 {view ===
						option.id
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						<Icon size={15} aria-hidden="true" class="shrink-0" />
						{#if view === option.id}
							<span>{option.label}</span>
						{/if}
					</button>
				{/each}
			</div>
			{#if view !== 'agenda'}
				<div class="flex items-center">
					{#if view === 'notes' || view === 'snippets'}
						<button
							type="button"
							onclick={createFolderFromMenu}
							class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
							aria-label={view === 'notes' ? 'Nueva carpeta de notas' : 'Nueva carpeta de snippets'}
							title="Nueva carpeta"
						>
							<FolderPlus size={18} aria-hidden="true" />
						</button>
					{/if}
					<button
						type="button"
						onclick={handlePlus}
						class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
						aria-label={view === 'notes'
							? 'Nueva nota'
							: view === 'snippets'
								? 'Nuevo snippet'
								: 'Nueva etiqueta'}
						title={view === 'notes' ? 'Nueva nota' : view === 'snippets' ? 'Nuevo snippet' : 'Nueva etiqueta'}
					>
						<Plus size={18} aria-hidden="true" />
					</button>
				</div>
			{/if}
		</div>

		{#if view === 'notes'}
			<nav aria-label="Lista de notas" class="flex-1 overflow-y-auto overscroll-contain p-2">
				{#if noteTree.length === 0}
					<p class="text-faint px-2 py-3 text-sm">Todavía no hay notas.</p>
				{:else}
					<ul
						class="flex flex-col gap-0.5"
						{@attach sidebarDragList(() => ({
							onDrop: (id, target) => onReorder('notes', id, target),
							canDropInto: (draggedId) => !noteFolders.some((folder) => folder.id === draggedId)
						}))}
					>
						{#each noteRows as row (row.id)}
							<li
								data-drag-id={row.kind === 'folder' ? row.node.folder.id : row.item.id}
								data-drag-is-folder={row.kind === 'folder' ? 'true' : undefined}
								data-drag-open-folder={row.kind === 'folder' ? !row.node.folder.collapsed : undefined}
								data-drag-folder-id={row.kind === 'folder' ? undefined : (row.item.folderId ?? '')}
								animate:flip={flipParams()}
								class={noteRowClass(row)}
							>
								{#if row.kind === 'folder'}
									{@render folderRowInner(row.node, 'notes')}
								{:else}
									{@render noteRowInner(row.item)}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</nav>
		{:else if view === 'snippets'}
			<section aria-label="Biblioteca de snippets" class="flex-1 overflow-y-auto overscroll-contain p-2">
				{#if snippetTree.length === 0}
					<p class="text-faint px-2 py-3 text-sm">
						Todavía no guardaste snippets. Pasá el mouse por un bloque de tu nota y tocá el
						marcador para guardar el primero.
					</p>
				{:else}
					<ul
						class="flex flex-col gap-0.5"
						{@attach sidebarDragList(() => ({
							onDrop: (id, target) => onReorder('snippets', id, target),
							canDropInto: (draggedId) => !snippetFolders.some((folder) => folder.id === draggedId)
						}))}
					>
						{#each snippetRows as row (row.id)}
							<li
								data-drag-id={row.kind === 'folder' ? row.node.folder.id : row.item.id}
								data-drag-is-folder={row.kind === 'folder' ? 'true' : undefined}
								data-drag-open-folder={row.kind === 'folder' ? !row.node.folder.collapsed : undefined}
								data-drag-folder-id={row.kind === 'folder' ? undefined : (row.item.folderId ?? '')}
								animate:flip={flipParams()}
								class={snippetRowClass(row)}
							>
								{#if row.kind === 'folder'}
									{@render folderRowInner(row.node, 'snippets')}
								{:else}
									{@render snippetRowInner(row.item)}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{:else if view === 'agenda'}
			<AgendaPanel onOpen={onOpenBlock} {onDataChanged} version={agendaVersion} />
		{:else}
			<section aria-label="Etiquetas" class="flex-1 overflow-y-auto overscroll-contain p-2">
				{#if creatingTag}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							submitNewTag();
						}}
						class="px-2 pb-2"
					>
						<!-- svelte-ignore a11y_autofocus — the user just asked for a new tag. -->
						<input
							bind:value={newTagName}
							placeholder="Nombre de la etiqueta…"
							aria-label="Nombre de la etiqueta nueva"
							autocomplete="off"
							autofocus
							onkeydown={(event) => {
								if (event.key === 'Escape') {
									creatingTag = false;
									newTagName = '';
								}
							}}
							class="border-border placeholder:text-faint focus-visible:ring-ring min-h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
						/>
					</form>
				{/if}
				{#if tags.length === 0 && !creatingTag}
					<p class="text-faint px-2 py-3 text-sm">
						Todavía no hay etiquetas. Creá una con el + de arriba, o desde una nota con el botón
						"+ etiqueta".
					</p>
				{:else}
					<ul
						class="flex flex-col gap-0.5"
						{@attach sidebarDragList(() => ({
							onDrop: (id, target) => onReorder('tags', id, target),
							canDropInto: () => false
						}))}
					>
						{#each tags as tag (tag.id)}
							<li
								data-drag-id={tag.id}
								animate:flip={flipParams()}
								class="group hover:bg-accent flex min-h-9 items-center gap-1 rounded-md px-2 transition-colors duration-(--motion-fast)"
							>
								{#if editingTagId === tag.id}
									<form
										onsubmit={(event) => {
											event.preventDefault();
											submitRename(tag);
										}}
										class="flex-1"
									>
										<!-- svelte-ignore a11y_autofocus — the user just chose to rename. -->
										<input
											bind:value={editingValue}
											aria-label="Nuevo nombre de la etiqueta"
											autocomplete="off"
											autofocus
											onkeydown={(event) => {
												if (event.key === 'Escape') editingTagId = null;
											}}
											onblur={() => (editingTagId = null)}
											class="border-border focus-visible:ring-ring min-h-7 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
										/>
									</form>
								{:else}
									<span class="min-w-0 flex-1 truncate text-sm">
										<span class="text-faint">#</span>{tag.name}
									</span>
									<div class="flex shrink-0 items-center">
										<button
											type="button"
											aria-label="Renombrar etiqueta {tag.name}"
											title="Renombrar"
											onclick={() => startRename(tag)}
											class="text-faint hover:text-foreground focus-visible:ring-ring flex size-9 md:size-7 items-center justify-center rounded-sm opacity-0 cn-touch-visible transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
										>
											<Pencil size={14} aria-hidden="true" />
										</button>
										<button
											type="button"
											aria-label="Borrar etiqueta {tag.name}"
											title="Borrar etiqueta"
											onclick={() => onDeleteTag(tag)}
											class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 md:size-7 items-center justify-center rounded-sm opacity-0 cn-touch-visible transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
										>
											<Trash2 size={14} aria-hidden="true" />
										</button>
									</div>
								{/if}
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

<style>
	/* Drag feedback: attribute-driven, toggled by sidebarDragList (dnd.ts).
	   The dragged row keeps its place in the list (dnd draws a separate
	   indicator line), so a minimal lift here is safe — the row's own rect is
	   excluded from the drop geometry. */
	:global([data-dragging='true']) {
		opacity: 0.5;
		transform: scale(1.02);
		box-shadow: 0 4px 12px var(--overlay);
	}
	:global([data-drag-over-folder='true']) {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
		border-radius: 6px;
	}
</style>
