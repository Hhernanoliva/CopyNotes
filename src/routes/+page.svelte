<script>
	import { CircleHelp, Moon, PanelLeft, Search, Sun } from '@lucide/svelte';
	import { mode, setMode } from 'mode-watcher';
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { MOTION, motionDuration } from '$lib/motion';
	import NoteSidebar from '$lib/components/NoteSidebar.svelte';
	import BackupDialog from '$lib/components/BackupDialog.svelte';
	import NewSnippetDialog from '$lib/components/NewSnippetDialog.svelte';
	import SearchDialog from '$lib/components/SearchDialog.svelte';
	import HelpDialog from '$lib/components/HelpDialog.svelte';
	import Editor from '$lib/editor/Editor.svelte';
	import {
		applySidebarUpdates,
		createBlock,
		createFolder,
		createNote,
		deleteFolderKeepContents,
		findOrCreateTag,
		getDemoNoteCreated,
		getLastOpenedNoteId,
		listFolders,
		listNotes,
		listSnippets,
		listTags,
		renameTag,
		replayJournal,
		setDemoNoteCreated,
		setHasCompletedOnboarding,
		setLastOpenedNoteId,
		setTheme,
		settlePendingWrites,
		softDeleteNote,
		softDeleteSnippet,
		softDeleteTag,
		updateFolder,
		updateSnippet
	} from '$lib/storage';
	import { planFolderDelete, planMoveToContainer, planReorder } from '$lib/organize';
	import { seedDemoNote, shouldSeedDemoNote } from '$lib/onboarding';
	import { buildSnippetsExport, snippetsExportFileName } from '$lib/export-import';
	import { saveTextFile } from '$lib/platform';
	import { tooltip } from '$lib/actions/tooltip';

	let notes = $state([]);
	let currentNoteId = $state(null);
	let sidebarOpen = $state(false);
	let sidebarView = $state('notes');
	let loading = $state(true);
	let loadError = $state(false);
	let saveState = $state('idle');
	let backupOpen = $state(false);
	let searchOpen = $state(false);
	let searchSeed = $state('');
	let helpOpen = $state(false);
	let newSnippetOpen = $state(false);
	let snippets = $state([]);
	let tags = $state([]);
	let noteFolders = $state([]);
	let snippetFolders = $state([]);
	let editorRef = $state();
	// Bumped after an import so the editor re-reads its note from storage.
	let dataVersion = $state(0);
	// Bumped when a due date changes in the editor, so an open Agenda re-reads
	// live. Kept separate from dataVersion, which would re-mount the editor.
	let agendaVersion = $state(0);
	// Block to focus once the editor (re)loads, set by the Agenda's jump-to-block.
	let pendingFocusBlockId = $state(null);

	const currentTheme = $derived(mode.current === 'light' ? 'light' : 'dark');

	function isDesktop() {
		return window.matchMedia('(min-width: 768px)').matches;
	}

	function showLoadError() {
		sidebarOpen = false;
		loadError = true;
		loading = false;
		toast.error('No se pudieron abrir tus notas. Cerramos el editor para protegerlas.');
	}

	$effect(() => {
		let cancelled = false;
		(async () => {
			try {
				// Writes the previous page journaled while dying (reload/close inside
				// the save debounce) must land before anything reads.
				await replayJournal();
				let [rows, lastId, snippetRows] = await Promise.all([
					listNotes(),
					getLastOpenedNoteId(),
					listSnippets()
				]);
				if (cancelled) return;

				// First run: seed an editable demo note so the user learns by using it.
				if (rows.length === 0) {
					const demoNoteCreated = await getDemoNoteCreated();
					if (!cancelled && shouldSeedDemoNote({ demoNoteCreated, noteCount: rows.length })) {
						const demo = await seedDemoNote();
						await Promise.all([setDemoNoteCreated(true), setHasCompletedOnboarding(true)]);
						if (cancelled) return;
						rows = await listNotes();
						lastId = demo.id;
					}
				}

				notes = rows;
				snippets = snippetRows;
				await refreshTags();
				await refreshFolders();
				const last = lastId ? rows.find((note) => note.id === lastId) : undefined;
				const current = last ?? rows[0];
				currentNoteId = current ? current.id : null;
				sidebarOpen = isDesktop();
				loading = false;
			} catch {
				if (!cancelled) showLoadError();
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function selectNote(id) {
		pendingFocusBlockId = null;
		currentNoteId = id;
		setLastOpenedNoteId(id);
		if (!isDesktop()) sidebarOpen = false;
	}

	function openFromAgenda(noteId, blockId) {
		// Remount the editor even when the note is already open so the focus
		// request applies (the editor is keyed on noteId + dataVersion).
		dataVersion++;
		selectNote(noteId);
		pendingFocusBlockId = blockId;
	}

	function isTypingTarget(target) {
		return (
			target?.isContentEditable ||
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA'
		);
	}

	// Cmd/Ctrl+K opens search; "?" opens help — but never while typing.
	// A more specific handler closer to the target (e.g. the block editor's
	// own Cmd/Ctrl+K for inserting a link) may already have claimed the key via
	// preventDefault by the time it bubbles here; respect that instead of
	// stealing focus into the search box.
	function handleShortcut(event) {
		if (event.defaultPrevented) return;
		if (loadError && event.key !== '?') return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
			event.preventDefault();
			searchSeed = window.getSelection()?.toString().trim() ?? '';
			searchOpen = true;
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			searchSeed = '';
			searchOpen = true;
			return;
		}
		if (event.key === '?' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
			event.preventDefault();
			helpOpen = true;
		}
	}

	async function toggleTheme() {
		const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
		setMode(nextTheme);
		try {
			await setTheme(nextTheme);
		} catch {
			toast.error('No se pudo recordar el tema. Probá de nuevo.');
		}
	}

	async function newNote() {
		// Leave the current note synchronously: creating the new one hits the
		// database, and anything typed meanwhile would land on the note that is
		// still on screen (e.g. its title renames the old note).
		currentNoteId = null;
		const note = await createNote();
		await createBlock({ noteId: note.id, type: 'text' });
		// createNote shifted every other note's sortOrder; re-read so the
		// in-memory list matches storage instead of guessing the new order.
		notes = await listNotes();
		selectNote(note.id);
	}

	async function deleteNote(id) {
		await softDeleteNote(id);
		notes = notes.filter((note) => note.id !== id);
		if (currentNoteId === id) {
			const next = notes[0];
			currentNoteId = next ? next.id : null;
			if (next) setLastOpenedNoteId(next.id);
		}
		toast.success('Nota borrada');
	}

	function handleNoteUpdated(id, changes) {
		const row = notes.find((note) => note.id === id);
		if (row) Object.assign(row, changes);
	}

	async function handleDataChanged() {
		try {
			const [rows, snippetRows, tagRows, noteFolderRows, snippetFolderRows] = await Promise.all([
				listNotes(),
				listSnippets(),
				listTags(),
				listFolders('note'),
				listFolders('snippet')
			]);
			notes = rows;
			snippets = snippetRows;
			tags = tagRows;
			noteFolders = noteFolderRows;
			snippetFolders = snippetFolderRows;
			if (!rows.some((note) => note.id === currentNoteId)) {
				currentNoteId = rows[0]?.id ?? null;
			}
			dataVersion += 1;
			return true;
		} catch {
			showLoadError();
			return false;
		}
	}

	async function refreshSnippets() {
		snippets = await listSnippets();
		await refreshTags();
	}

	async function refreshTags() {
		tags = await listTags();
	}

	async function createTagFromSidebar(name) {
		const tag = await findOrCreateTag(name);
		if (tag) await refreshTags();
	}

	async function renameTagFromSidebar(tag, name) {
		const renamed = await renameTag(tag.id, name);
		if (!renamed) {
			toast.error('Ya existe una etiqueta con ese nombre.');
			return;
		}
		await refreshTags();
		// Chips inside the editor show the old name; remount to re-read.
		dataVersion += 1;
	}

	async function deleteTag(tag) {
		await softDeleteTag(tag.id);
		await refreshTags();
		dataVersion += 1;
		toast.success('Etiqueta borrada');
	}

	async function toggleFavorite(snippet) {
		await updateSnippet(snippet.id, { isFavorite: !snippet.isFavorite });
		await refreshSnippets();
	}

	async function renameSnippetFromSidebar(snippet, name) {
		await updateSnippet(snippet.id, { name });
		await refreshSnippets();
	}

	async function refreshFolders() {
		noteFolders = await listFolders('note');
		snippetFolders = await listFolders('snippet');
	}

	async function createFolderFromSidebar(view, name) {
		const folder = await createFolder(view === 'notes' ? 'note' : 'snippet', name);
		await refreshFolders();
		if (view === 'notes') notes = await listNotes();
		else snippets = await listSnippets();
		return folder;
	}

	async function renameFolderFromSidebar(folder, name) {
		await updateFolder(folder.id, { name });
		await refreshFolders();
	}

	async function toggleFolderFromSidebar(folder) {
		await updateFolder(folder.id, { collapsed: !folder.collapsed });
		await refreshFolders();
	}

	async function deleteFolderFromSidebar(view, folder) {
		const kindItems = view === 'notes' ? notes : snippets;
		const folderRows = view === 'notes' ? noteFolders : snippetFolders;
		const table = view === 'notes' ? 'notes' : 'snippets';
		const rootContainer = [
			...folderRows.map((row) => ({ id: row.id, sortOrder: row.sortOrder })),
			...kindItems
				.filter((item) => (item.folderId ?? null) === null)
				.map((item) => ({ id: item.id, sortOrder: item.sortOrder }))
		];
		const contents = kindItems.filter((item) => item.folderId === folder.id);
		const { updates } = planFolderDelete(rootContainer, $state.snapshot(contents), folder.id);
		// Root renumbering may touch folder rows and item rows: split by id.
		const folderIds = new Set(folderRows.map((row) => row.id));
		const itemUpdates = updates.filter((update) => !folderIds.has(update.id));
		const folderUpdates = updates.filter((update) => folderIds.has(update.id));
		await deleteFolderKeepContents(folder.id, { [table]: itemUpdates });
		await applySidebarUpdates('folders', folderUpdates);
		await refreshFolders();
		if (view === 'notes') notes = await listNotes();
		else snippets = await listSnippets();
		toast.success('Carpeta borrada; su contenido volvió a la lista');
	}

	async function reorderSidebar(view, draggedId, target) {
		// Tags are a single flat list with no folders.
		if (view === 'tags') {
			if (target.type !== 'insert') return;
			await applySidebarUpdates(
				'tags',
				planReorder($state.snapshot(tags), draggedId, target.index).updates
			);
			tags = await listTags();
			return;
		}

		const isNotes = view === 'notes';
		const items = isNotes ? notes : snippets;
		const folderRows = isNotes ? noteFolders : snippetFolders;
		const table = isNotes ? 'notes' : 'snippets';
		const folderIds = new Set(folderRows.map((row) => row.id));
		const draggedIsFolder = folderIds.has(draggedId);

		// Root container mixes folders and loose items in one sortOrder sequence.
		const rootContainer = $state.snapshot([
			...folderRows.map((row) => ({ id: row.id, sortOrder: row.sortOrder })),
			...items.filter((item) => (item.folderId ?? null) === null)
		]);
		const containerOf = (folderId) =>
			folderId === null
				? rootContainer
				: $state.snapshot(items.filter((item) => item.folderId === folderId));

		let updates = [];
		if (target.type === 'into-folder') {
			if (draggedIsFolder) return; // never nest folders
			const dragged = items.find((item) => item.id === draggedId);
			if ((dragged?.folderId ?? null) === target.folderId) return;
			updates = planMoveToContainer(
				containerOf(dragged?.folderId ?? null),
				containerOf(target.folderId),
				draggedId,
				0,
				target.folderId
			).updates;
		} else {
			if (draggedIsFolder && target.container !== null) return; // folders live at root
			const dragged = draggedIsFolder ? null : items.find((item) => item.id === draggedId);
			const sourceFolder = dragged?.folderId ?? null;
			if (sourceFolder === (target.container ?? null)) {
				updates = planReorder(containerOf(sourceFolder), draggedId, target.index).updates;
			} else {
				updates = planMoveToContainer(
					containerOf(sourceFolder),
					containerOf(target.container ?? null),
					draggedId,
					target.index,
					target.container ?? null
				).updates;
			}
		}

		// Root renumbering can touch folder rows and item rows: route each
		// update to its table (folder updates never carry folderId).
		const folderUpdates = updates.filter((update) => folderIds.has(update.id));
		const itemUpdates = updates.filter((update) => !folderIds.has(update.id));
		await applySidebarUpdates(table, itemUpdates);
		await applySidebarUpdates('folders', folderUpdates);
		await refreshFolders();
		if (isNotes) notes = await listNotes();
		else snippets = await listSnippets();
	}

	async function deleteSnippet(snippet) {
		await softDeleteSnippet(snippet.id);
		await refreshSnippets();
		toast.success('Snippet borrado');
	}

	async function exportSnippets() {
		try {
			await settlePendingWrites();
			const currentSnippets = await listSnippets();
			snippets = currentSnippets;
			const exported = buildSnippetsExport(currentSnippets, {
				exportedAt: new Date().toISOString()
			});
			const result = await saveTextFile({
				fileName: snippetsExportFileName(new Date()),
				content: JSON.stringify(exported, null, 2),
				mimeType: 'application/json'
			});
			if (result.status === 'saved') toast.success('Snippets exportados');
		} catch {
			toast.error('No se pudieron exportar los snippets. Tus datos siguen intactos.');
		}
	}
</script>

<svelte:head>
	<title>CopyNotes</title>
	<meta name="description" content="Notas locales, simples y listas para copiar." />
</svelte:head>

<svelte:window onkeydown={handleShortcut} />

<div class="flex h-svh overflow-hidden">
	<NoteSidebar
		{notes}
		{snippets}
		{tags}
		{noteFolders}
		{snippetFolders}
		{currentNoteId}
		open={sidebarOpen && !loadError}
		bind:view={sidebarView}
		onSelect={selectNote}
		onCreate={newNote}
		onClose={() => (sidebarOpen = false)}
		onBackup={() => (backupOpen = true)}
		onDeleteNote={deleteNote}
		onNewSnippet={() => (newSnippetOpen = true)}
		onToggleFavorite={toggleFavorite}
		onRenameSnippet={renameSnippetFromSidebar}
		onReorder={reorderSidebar}
		onCreateFolder={createFolderFromSidebar}
		onRenameFolder={renameFolderFromSidebar}
		onToggleFolder={toggleFolderFromSidebar}
		onDeleteFolder={deleteFolderFromSidebar}
		onDeleteSnippet={deleteSnippet}
		onExportSnippets={exportSnippets}
		onCreateTag={createTagFromSidebar}
		onRenameTag={renameTagFromSidebar}
		onDeleteTag={deleteTag}
		onOpenBlock={openFromAgenda}
		onDataChanged={handleDataChanged}
		{agendaVersion}
	/>

	<BackupDialog bind:open={backupOpen} {currentNoteId} onDataChanged={handleDataChanged} />
	<NewSnippetDialog bind:open={newSnippetOpen} onCreated={refreshSnippets} />
	<SearchDialog bind:open={searchOpen} initialQuery={searchSeed} onOpenNote={selectNote} />
	<HelpDialog bind:open={helpOpen} />

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
			<button
				type="button"
				onclick={() => (sidebarOpen = !sidebarOpen)}
				disabled={loadError}
				aria-label={sidebarOpen ? 'Ocultar lista de notas' : 'Mostrar lista de notas'}
				aria-expanded={sidebarOpen}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				<PanelLeft size={18} aria-hidden="true" />
			</button>
			<span class="text-sm font-bold">CopyNotes</span>
			<button
				type="button"
				onclick={() => {
					searchSeed = '';
					searchOpen = true;
				}}
				disabled={loadError}
				aria-label="Buscar"
				title="Buscar (Cmd/Ctrl+K o Cmd/Ctrl+F)"
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring ml-auto flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				<Search size={18} aria-hidden="true" />
			</button>
			<button
				type="button"
				onclick={() => (helpOpen = true)}
				aria-label="Ayuda y atajos"
				use:tooltip={'Ayuda y atajos (?)'}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				<CircleHelp size={18} aria-hidden="true" />
			</button>
			<button
				type="button"
				onclick={toggleTheme}
				aria-label={currentTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
				use:tooltip={currentTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				<span class="relative flex size-[18px] items-center justify-center">
					{#if currentTheme === 'dark'}
						<span
							class="absolute"
							in:fade={{ duration: motionDuration(MOTION.fast) }}
							out:fade={{ duration: motionDuration(MOTION.fast) }}
						>
							<Sun size={18} aria-hidden="true" />
						</span>
					{:else}
						<span
							class="absolute"
							in:fade={{ duration: motionDuration(MOTION.fast) }}
							out:fade={{ duration: motionDuration(MOTION.fast) }}
						>
							<Moon size={18} aria-hidden="true" />
						</span>
					{/if}
				</span>
			</button>
			<span aria-live="polite" class="text-muted-foreground text-xs">
				{#if saveState === 'saving'}
					Guardando…
				{:else if saveState === 'saved'}
					<span
						in:fade={{ duration: motionDuration(MOTION.fast) }}
						out:fade={{ duration: motionDuration(MOTION.fast) }}>Guardado</span
					>
				{/if}
			</span>
		</header>

		<main id="contenido-principal" tabindex="-1" class="flex-1 overflow-y-auto focus-visible:outline-none">
			{#if loading}
				<div
					class="mx-auto w-full max-w-(--editor-max-width) px-[0.9rem] py-6 md:px-6 md:py-14"
					aria-hidden="true"
				>
					<div class="bg-muted h-10 w-2/3 animate-pulse rounded-md"></div>
					<div class="bg-muted mt-8 h-5 w-full animate-pulse rounded-md"></div>
					<div class="bg-muted mt-3 h-5 w-5/6 animate-pulse rounded-md"></div>
				</div>
			{:else if loadError}
				<div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center" role="status">
					<h1 class="text-2xl font-bold text-balance">No pudimos abrir tus notas</h1>
					<p class="text-muted-foreground max-w-sm text-balance">
						Cerramos el editor para proteger tus datos. Recargá CopyNotes para volver a intentarlo.
					</p>
					<button
						type="button"
						onclick={() => window.location.reload()}
						class="bg-primary text-primary-foreground focus-visible:ring-ring mt-2 flex min-h-(--touch-target) items-center rounded-md px-5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px"
					>
						Volver a intentar
					</button>
				</div>
			{:else if currentNoteId}
				{#key `${currentNoteId}:${dataVersion}`}
					<Editor
						bind:this={editorRef}
						noteId={currentNoteId}
						initialFocusBlockId={pendingFocusBlockId}
						onNoteUpdated={handleNoteUpdated}
						onSaveStateChange={(state) => (saveState = state)}
						onSnippetsChanged={refreshSnippets}
						onTagsChanged={refreshTags}
						onDatesChanged={() => (agendaVersion += 1)}
					/>
				{/key}
			{:else}
				<div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
					<h1 class="text-2xl font-bold">Tu espacio para escribir</h1>
					<p class="text-muted-foreground max-w-sm text-balance">
						Todo se guarda en este dispositivo, automáticamente. Empezá con tu primera nota.
					</p>
					<button
						type="button"
						onclick={newNote}
						class="bg-primary text-primary-foreground focus-visible:ring-ring mt-2 flex min-h-(--touch-target) items-center rounded-md px-5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px"
					>
						Nueva nota
					</button>
					<button
						type="button"
						onclick={() => (backupOpen = true)}
						class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm underline underline-offset-4 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
					>
						o importá un backup
					</button>
				</div>
			{/if}
		</main>
	</div>
</div>
