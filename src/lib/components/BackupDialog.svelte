<script>
	import { toast } from 'svelte-sonner';
	import { FileDown, FileUp, X } from '@lucide/svelte';
	import {
		backupFileName,
		buildBackup,
		downloadFile,
		filterSafeSettings,
		noteExportFileName,
		noteToHtml,
		noteToMarkdown,
		planMerge,
		readFileAsText,
		validateBackup
	} from '$lib/export-import';
	import { sanitizeBackupData } from '$lib/format';
	import {
		applyMergePlan,
		dumpAllTables,
		getNote,
		listBlocksByNote,
		replaceAllTables
	} from '$lib/storage';

	let { open = $bindable(false), currentNoteId, onDataChanged } = $props();

	let dialogEl = $state(null);
	let fileInputEl = $state(null);
	// idle → reviewing (file validated) → confirmingReplace (danger step)
	let step = $state('idle');
	let review = $state(null);
	let importing = $state(false);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			step = 'idle';
			review = null;
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	async function exportAllJson() {
		const backup = buildBackup(await dumpAllTables(), {
			appVersion: '0.0.1',
			exportedAt: new Date().toISOString()
		});
		downloadFile(backupFileName(new Date()), JSON.stringify(backup, null, 2), 'application/json');
		toast.success('Respaldo descargado');
	}

	async function exportCurrentNote(format) {
		const note = await getNote(currentNoteId);
		if (!note) return;
		const blocks = await listBlocksByNote(note.id);
		const content = format === 'md' ? noteToMarkdown(note, blocks) : noteToHtml(note, blocks);
		const mime = format === 'md' ? 'text/markdown' : 'text/html';
		downloadFile(noteExportFileName(note.title, format), content, mime);
		toast.success('Nota exportada');
	}

	async function handleFileChosen(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		let parsed;
		try {
			parsed = JSON.parse(await readFileAsText(file));
		} catch {
			toast.error('Ese archivo no se puede leer como respaldo de CopyNotes.');
			return;
		}
		const local = await dumpAllTables();
		const result = validateBackup(parsed, {
			existingNoteIds: local.notes.map((row) => row.id),
			existingBlockIds: local.blocks.map((row) => row.id),
			existingTagIds: local.tags.map((row) => row.id),
			existingSnippetIds: local.snippets.map((row) => row.id)
		});
		if (!result.ok) {
			toast.error(result.errors[0] ?? 'El archivo no es un respaldo válido.');
			return;
		}
		// Ingest gate: clean every html field once, here, so both import paths
		// (merge and replace-all) only ever see sanitized markup. Idempotent for
		// backups the app itself exported.
		const backup = { ...result.backup, data: sanitizeBackupData(result.backup.data) };
		const plan = planMerge(local, backup.data);
		review = { fileName: file.name, backup, warnings: result.warnings, plan };
		step = 'reviewing';
	}

	async function applyMerge() {
		importing = true;
		try {
			// $state proxies can't be structured-cloned into IndexedDB.
			await applyMergePlan($state.snapshot(review.plan));
			toast.success('Respaldo importado. Tus datos actuales quedaron intactos.');
			finishImport();
		} catch {
			toast.error('No se pudo importar. Tus datos no cambiaron.');
		} finally {
			importing = false;
		}
	}

	async function applyReplaceAll() {
		importing = true;
		try {
			const data = $state.snapshot(review.backup.data);
			await replaceAllTables({ ...data, settings: filterSafeSettings(data.settings) });
			toast.success('Respaldo restaurado desde cero.');
			finishImport();
		} catch {
			toast.error('No se pudo restaurar. Tus datos no cambiaron.');
		} finally {
			importing = false;
		}
	}

	function finishImport() {
		step = 'idle';
		review = null;
		open = false;
		onDataChanged();
	}

	const summaryLine = $derived.by(() => {
		if (!review) return '';
		const { summary } = review.plan;
		const parts = [];
		const label = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
		if (summary.notes.added) parts.push(label(summary.notes.added, 'nota', 'notas'));
		if (summary.blocks.added) parts.push(label(summary.blocks.added, 'bloque', 'bloques'));
		if (summary.snippets.added) parts.push(label(summary.snippets.added, 'snippet', 'snippets'));
		if (summary.tags.added) parts.push(label(summary.tags.added, 'etiqueta', 'etiquetas'));
		if (parts.length === 0) return 'No hay nada nuevo para agregar: ya tenés todo lo que trae este archivo.';
		return 'Se agregarán ' + parts.join(', ') + '.';
	});

	const skippedCount = $derived(
		review
			? review.plan.summary.notes.skipped +
					review.plan.summary.blocks.skipped +
					review.plan.summary.snippets.skipped +
					review.plan.summary.tags.skipped
			: 0
	);
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="backup-title"
	class="bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="flex items-center justify-between border-b px-4 py-3">
		<h2 id="backup-title" class="text-sm font-bold">Respaldo</h2>
		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	{#if step === 'idle'}
		<div class="flex flex-col gap-5 px-4 py-4">
			<p class="text-muted-foreground text-sm">
				Tus notas viven en este dispositivo. Si borrás los datos del navegador o cambiás de equipo
				sin un respaldo, se pierden. Descargá un respaldo cada tanto para quedarte tranquilo.
			</p>

			<section class="flex flex-col gap-2">
				<h3 class="text-xs font-bold tracking-wide uppercase text-muted-foreground">Exportar</h3>
				<button
					type="button"
					onclick={exportAllJson}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px"
				>
					<FileDown size={16} aria-hidden="true" />
					Descargar respaldo completo (JSON)
				</button>
				{#if currentNoteId}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => exportCurrentNote('md')}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
						>
							Nota actual en Markdown
						</button>
						<button
							type="button"
							onclick={() => exportCurrentNote('html')}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
						>
							Nota actual en HTML
						</button>
					</div>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<h3 class="text-xs font-bold tracking-wide uppercase text-muted-foreground">Importar</h3>
				<p class="text-muted-foreground text-sm">
					Antes de importar te recomendamos descargar un respaldo de lo que tenés ahora.
				</p>
				<button
					type="button"
					onclick={() => fileInputEl.click()}
					class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center gap-2 rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
				>
					<FileUp size={16} aria-hidden="true" />
					Elegir archivo de respaldo…
				</button>
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".json,application/json"
					onchange={handleFileChosen}
					class="sr-only"
					aria-label="Archivo de respaldo de CopyNotes"
				/>
			</section>
		</div>
	{:else if step === 'reviewing'}
		<div class="flex flex-col gap-4 px-4 py-4">
			<p class="text-sm">
				<span class="font-bold">{review.fileName}</span> es un respaldo válido de CopyNotes.
			</p>
			<div class="bg-muted rounded-md px-3 py-2 text-sm">
				<p>{summaryLine}</p>
				{#if skippedCount > 0}
					<p class="text-muted-foreground mt-1">
						{skippedCount === 1
							? '1 elemento idéntico ya existe y se omite.'
							: `${skippedCount} elementos idénticos ya existen y se omiten.`}
					</p>
				{/if}
				{#if review.plan.summary.conflicts > 0}
					<p class="text-muted-foreground mt-1">
						{review.plan.summary.conflicts === 1
							? '1 elemento cambió en los dos lados: se conservarán ambas versiones.'
							: `${review.plan.summary.conflicts} elementos cambiaron en los dos lados: se conservarán ambas versiones.`}
					</p>
				{/if}
				{#each review.warnings as warning (warning)}
					<p class="text-muted-foreground mt-1">{warning}</p>
				{/each}
			</div>
			<p class="text-muted-foreground text-sm">
				Importar suma lo del archivo a lo que ya tenés. Nada de lo tuyo se pisa ni se borra.
			</p>
			<div class="flex flex-col gap-2">
				<button
					type="button"
					onclick={applyMerge}
					disabled={importing}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					{importing ? 'Importando…' : 'Importar y conservar lo mío'}
				</button>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => {
							step = 'idle';
							review = null;
						}}
						class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
					>
						Cancelar
					</button>
					<button
						type="button"
						onclick={() => (step = 'confirmingReplace')}
						class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
					>
						Reemplazar todo…
					</button>
				</div>
			</div>
		</div>
	{:else if step === 'confirmingReplace'}
		<div class="flex flex-col gap-4 px-4 py-4">
			<p class="text-sm font-bold">¿Reemplazar todo con este respaldo?</p>
			<p class="text-muted-foreground text-sm">
				Esto borra todas tus notas, etiquetas y snippets actuales y los reemplaza por el contenido
				de <span class="font-bold">{review.fileName}</span>. No se puede deshacer. Si no descargaste
				un respaldo de lo actual, hacelo primero.
			</p>
			<div class="flex flex-col gap-2">
				<button
					type="button"
					onclick={applyReplaceAll}
					disabled={importing}
					class="bg-destructive text-destructive-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					{importing ? 'Reemplazando…' : 'Sí, borrar lo actual y reemplazar'}
				</button>
				<button
					type="button"
					onclick={() => (step = 'reviewing')}
					class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
				>
					Volver
				</button>
			</div>
		</div>
	{/if}
</dialog>
