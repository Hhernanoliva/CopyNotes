<script>
	import { Moon, PanelLeft, Search, Sun } from '@lucide/svelte';
	import { mode, setMode } from 'mode-watcher';
	import { fade } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import NoteSidebar from '$lib/components/NoteSidebar.svelte';
	import BackupDialog from '$lib/components/BackupDialog.svelte';
	import NewSnippetDialog from '$lib/components/NewSnippetDialog.svelte';
	import SearchDialog from '$lib/components/SearchDialog.svelte';
	import Editor from '$lib/editor/Editor.svelte';
	import {
		assignTag,
		createBlock,
		createNote,
		findOrCreateTag,
		getLastOpenedNoteId,
		listNotes,
		listSnippets,
		listTags,
		listTagsForMany,
		renameTag,
		setLastOpenedNoteId,
		setTheme,
		softDeleteSnippet,
		softDeleteTag,
		unassignTag,
		updateSnippet
	} from '$lib/storage';
	import { filterSnippets } from '$lib/snippets';
	import { buildSnippetsExport, downloadFile, snippetsExportFileName } from '$lib/export-import';
	import { tooltip } from '$lib/actions/tooltip';

	let notes = $state([]);
	let currentNoteId = $state(null);
	let sidebarOpen = $state(false);
	let sidebarView = $state('notes');
	let loading = $state(true);
	let saveState = $state('idle');
	let backupOpen = $state(false);
	let searchOpen = $state(false);
	let newSnippetOpen = $state(false);
	let snippets = $state([]);
	let tags = $state([]);
	let snippetTagsMap = $state({});
	let editorRef = $state();
	// Bumped after an import so the editor re-reads its note from storage.
	let dataVersion = $state(0);

	// Favorites first, same ordering as the /snippet menu.
	const sortedSnippets = $derived(filterSnippets(snippets, ''));
	const currentTheme = $derived(mode.current === 'light' ? 'light' : 'dark');

	function isDesktop() {
		return window.matchMedia('(min-width: 768px)').matches;
	}

	$effect(() => {
		let cancelled = false;
		(async () => {
			const [rows, lastId, snippetRows] = await Promise.all([
				listNotes(),
				getLastOpenedNoteId(),
				listSnippets()
			]);
			if (cancelled) return;
			notes = rows;
			snippets = snippetRows;
			await refreshTags();
			const last = lastId ? rows.find((note) => note.id === lastId) : undefined;
			const current = last ?? rows[0];
			currentNoteId = current ? current.id : null;
			sidebarOpen = isDesktop();
			loading = false;
		})();
		return () => {
			cancelled = true;
		};
	});

	function selectNote(id) {
		currentNoteId = id;
		setLastOpenedNoteId(id);
		if (!isDesktop()) sidebarOpen = false;
	}

	// Cmd/Ctrl+K opens search from anywhere.
	function handleShortcut(event) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			searchOpen = true;
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
		const note = await createNote();
		await createBlock({ noteId: note.id, type: 'text' });
		notes = [note, ...notes];
		selectNote(note.id);
	}

	function handleNoteUpdated(id, changes) {
		const row = notes.find((note) => note.id === id);
		if (row) Object.assign(row, changes);
	}

	async function handleDataChanged() {
		const rows = await listNotes();
		notes = rows;
		if (!rows.some((note) => note.id === currentNoteId)) {
			currentNoteId = rows[0]?.id ?? null;
		}
		await refreshSnippets();
		dataVersion += 1;
	}

	async function refreshSnippets() {
		snippets = await listSnippets();
		await refreshTags();
	}

	async function refreshTags() {
		tags = await listTags();
		snippetTagsMap = await listTagsForMany(
			'snippet',
			snippets.map((snippet) => snippet.id)
		);
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

	async function snippetTagPick(snippet, option) {
		const tag = option.kind === 'create' ? await findOrCreateTag(option.name) : option.tag;
		if (!tag) return;
		const assigned = (snippetTagsMap[snippet.id] ?? []).some((row) => row.id === tag.id);
		if (assigned) await unassignTag(tag.id, 'snippet', snippet.id);
		else await assignTag(tag.id, 'snippet', snippet.id);
		await refreshTags();
	}

	async function snippetUntag(snippet, tag) {
		await unassignTag(tag.id, 'snippet', snippet.id);
		await refreshTags();
	}

	async function toggleFavorite(snippet) {
		await updateSnippet(snippet.id, { isFavorite: !snippet.isFavorite });
		await refreshSnippets();
	}

	async function deleteSnippet(snippet) {
		await softDeleteSnippet(snippet.id);
		await refreshSnippets();
		toast.success('Snippet borrado');
	}

	async function insertSnippet(snippet) {
		if (!currentNoteId || !editorRef) {
			toast.error('Abrí una nota primero para insertar el snippet.');
			return;
		}
		await editorRef.insertSnippet(snippet);
		if (!isDesktop()) sidebarOpen = false;
	}

	function exportSnippets() {
		const exported = buildSnippetsExport($state.snapshot(snippets), {
			exportedAt: new Date().toISOString()
		});
		downloadFile(
			snippetsExportFileName(new Date()),
			JSON.stringify(exported, null, 2),
			'application/json'
		);
		toast.success('Snippets exportados');
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
		snippets={sortedSnippets}
		{tags}
		snippetTags={snippetTagsMap}
		{currentNoteId}
		open={sidebarOpen}
		bind:view={sidebarView}
		onSelect={selectNote}
		onCreate={newNote}
		onClose={() => (sidebarOpen = false)}
		onBackup={() => (backupOpen = true)}
		onNewSnippet={() => (newSnippetOpen = true)}
		onToggleFavorite={toggleFavorite}
		onInsertSnippet={insertSnippet}
		onDeleteSnippet={deleteSnippet}
		onExportSnippets={exportSnippets}
		onCreateTag={createTagFromSidebar}
		onRenameTag={renameTagFromSidebar}
		onDeleteTag={deleteTag}
		onSnippetTagPick={snippetTagPick}
		onSnippetUntag={snippetUntag}
	/>

	<BackupDialog bind:open={backupOpen} {currentNoteId} onDataChanged={handleDataChanged} />
	<NewSnippetDialog bind:open={newSnippetOpen} onCreated={refreshSnippets} />
	<SearchDialog bind:open={searchOpen} onOpenNote={selectNote} />

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
			<button
				type="button"
				onclick={() => (sidebarOpen = !sidebarOpen)}
				aria-label={sidebarOpen ? 'Ocultar lista de notas' : 'Mostrar lista de notas'}
				aria-expanded={sidebarOpen}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				<PanelLeft size={18} aria-hidden="true" />
			</button>
			<span class="text-sm font-bold">CopyNotes</span>
			<button
				type="button"
				onclick={() => (searchOpen = true)}
				aria-label="Buscar"
				title="Buscar (Cmd/Ctrl+K)"
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring ml-auto flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				<Search size={18} aria-hidden="true" />
			</button>
			<button
				type="button"
				onclick={toggleTheme}
				aria-label={currentTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
				use:tooltip={currentTheme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				{#if currentTheme === 'dark'}
					<Sun size={18} aria-hidden="true" />
				{:else}
					<Moon size={18} aria-hidden="true" />
				{/if}
			</button>
			<span aria-live="polite" class="text-muted-foreground text-xs">
				{#if saveState === 'saving'}
					Guardando…
				{:else if saveState === 'saved'}
					<span in:fade={{ duration: 150 }}>Guardado</span>
				{/if}
			</span>
		</header>

		<main id="contenido-principal" tabindex="-1" class="flex-1 overflow-y-auto focus-visible:outline-none">
			{#if loading}
				<div class="mx-auto w-full max-w-(--editor-max-width) px-6 py-10 md:py-14" aria-hidden="true">
					<div class="bg-muted h-10 w-2/3 animate-pulse rounded-md"></div>
					<div class="bg-muted mt-8 h-5 w-full animate-pulse rounded-md"></div>
					<div class="bg-muted mt-3 h-5 w-5/6 animate-pulse rounded-md"></div>
				</div>
			{:else if currentNoteId}
				{#key `${currentNoteId}:${dataVersion}`}
					<Editor
						bind:this={editorRef}
						noteId={currentNoteId}
						onNoteUpdated={handleNoteUpdated}
						onSaveStateChange={(state) => (saveState = state)}
						onSnippetsChanged={refreshSnippets}
						onTagsChanged={refreshTags}
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
				</div>
			{/if}
		</main>
	</div>
</div>
