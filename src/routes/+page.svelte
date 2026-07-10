<script>
	import { PanelLeft } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import NoteSidebar from '$lib/components/NoteSidebar.svelte';
	import BackupDialog from '$lib/components/BackupDialog.svelte';
	import Editor from '$lib/editor/Editor.svelte';
	import {
		createBlock,
		createNote,
		getLastOpenedNoteId,
		listNotes,
		setLastOpenedNoteId
	} from '$lib/storage';

	let notes = $state([]);
	let currentNoteId = $state(null);
	let sidebarOpen = $state(false);
	let loading = $state(true);
	let saveState = $state('idle');
	let backupOpen = $state(false);
	// Bumped after an import so the editor re-reads its note from storage.
	let dataVersion = $state(0);

	function isDesktop() {
		return window.matchMedia('(min-width: 768px)').matches;
	}

	$effect(() => {
		let cancelled = false;
		(async () => {
			const [rows, lastId] = await Promise.all([listNotes(), getLastOpenedNoteId()]);
			if (cancelled) return;
			notes = rows;
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
		dataVersion += 1;
	}
</script>

<svelte:head>
	<title>CopyNotes</title>
	<meta name="description" content="Notas locales, simples y listas para copiar." />
</svelte:head>

<div class="flex h-svh overflow-hidden">
	<NoteSidebar
		{notes}
		{currentNoteId}
		open={sidebarOpen}
		onSelect={selectNote}
		onCreate={newNote}
		onClose={() => (sidebarOpen = false)}
		onBackup={() => (backupOpen = true)}
	/>

	<BackupDialog bind:open={backupOpen} {currentNoteId} onDataChanged={handleDataChanged} />

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
			<span aria-live="polite" class="text-muted-foreground ml-auto text-xs">
				{#if saveState === 'saving'}
					Guardando…
				{:else if saveState === 'saved'}
					<span in:fade={{ duration: 150 }}>Guardado</span>
				{/if}
			</span>
		</header>

		<main class="flex-1 overflow-y-auto">
			{#if loading}
				<div class="mx-auto w-full max-w-(--editor-max-width) px-6 py-10 md:py-14" aria-hidden="true">
					<div class="bg-muted h-10 w-2/3 animate-pulse rounded-md"></div>
					<div class="bg-muted mt-8 h-5 w-full animate-pulse rounded-md"></div>
					<div class="bg-muted mt-3 h-5 w-5/6 animate-pulse rounded-md"></div>
				</div>
			{:else if currentNoteId}
				{#key `${currentNoteId}:${dataVersion}`}
					<Editor
						noteId={currentNoteId}
						onNoteUpdated={handleNoteUpdated}
						onSaveStateChange={(state) => (saveState = state)}
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
