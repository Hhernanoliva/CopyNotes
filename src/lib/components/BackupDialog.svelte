<script>
	import { toast } from 'svelte-sonner';
	import { fade } from 'svelte/transition';
	import { FileDown, FileUp, X } from '@lucide/svelte';
	import { MOTION, motionDuration } from '$lib/motion';
	import {
		backupFileName,
		buildBackup,
		filterSafeSettings,
		noteExportFileName,
		noteToHtml,
		noteToMarkdown,
		planMerge,
		validateBackup
	} from '$lib/export-import';
	import { sanitizeBackupData } from '$lib/format';
	import { getBackupSource, openTextFile, saveTextFile } from '$lib/platform';
	import {
		applyMergePlan,
		dumpAllTables,
		getNote,
		listBlocksByNote,
		replaceAllTables,
		settlePendingWrites
	} from '$lib/storage';

	let { open = $bindable(false), currentNoteId, onDataChanged } = $props();

	let dialogEl = $state(null);
	// idle → reviewing (file validated) → confirmingReplace (danger step)
	let step = $state('idle');
	let review = $state(null);
	let importing = $state(false);
	let exporting = $state(false);

	let titleEl = $state(null);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			step = 'idle';
			review = null;
			dialogEl.showModal();
			// showModal() auto-focuses the first tabbable element (the X), which
			// reads as if the close button were pre-pressed. Park focus on the
			// heading instead so nothing looks activated on open.
			titleEl?.focus();
		} else if (!open && dialogEl.open && !importing) {
			dialogEl.close();
		}
	});

	function closeDialog() {
		if (!importing) open = false;
	}

	async function exportAllJson() {
		exporting = true;
		try {
			const backup = buildBackup(await dumpAllTables(), {
				appVersion: '0.0.1',
				exportedAt: new Date().toISOString(),
				source: getBackupSource()
			});
			const result = await saveTextFile({
				fileName: backupFileName(new Date()),
				content: JSON.stringify(backup, null, 2),
				mimeType: 'application/json'
			});
			if (result.status === 'saved') toast.success('Respaldo descargado');
		} catch {
			toast.error('No se pudo guardar el respaldo. Tus datos siguen intactos.');
		} finally {
			exporting = false;
		}
	}

	async function exportCurrentNote(format) {
		exporting = true;
		try {
			await settlePendingWrites();
			const note = await getNote(currentNoteId);
			if (!note) return;
			const blocks = await listBlocksByNote(note.id);
			const content = format === 'md' ? noteToMarkdown(note, blocks) : noteToHtml(note, blocks);
			const mimeType = format === 'md' ? 'text/markdown' : 'text/html';
			const result = await saveTextFile({
				fileName: noteExportFileName(note.title, format),
				content,
				mimeType
			});
			if (result.status === 'saved') toast.success('Nota exportada');
		} catch {
			toast.error('No se pudo exportar la nota. Tus datos siguen intactos.');
		} finally {
			exporting = false;
		}
	}

	async function chooseBackupFile() {
		let opened;
		try {
			opened = await openTextFile({ accept: '.json,application/json' });
		} catch {
			toast.error('Ese archivo no se puede leer como respaldo de CopyNotes.');
			return;
		}
		if (opened.status === 'cancelled') return;
		let parsed;
		try {
			parsed = JSON.parse(opened.content);
		} catch {
			toast.error('Ese archivo no se puede leer como respaldo de CopyNotes.');
			return;
		}
		let local;
		try {
			local = await dumpAllTables();
		} catch {
			toast.error('No se pudieron guardar tus últimos cambios. No se importó nada.');
			return;
		}
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
		review = { fileName: opened.fileName, backup, warnings: result.warnings, plan };
		step = 'reviewing';
	}

	async function applyMerge() {
		importing = true;
		try {
			// $state proxies can't be structured-cloned into IndexedDB.
			await applyMergePlan($state.snapshot(review.plan));
			const refreshed = await finishImport();
			if (refreshed === false) {
				toast.error('El respaldo se importó, pero la pantalla no pudo actualizarse. Recargá CopyNotes.');
			} else {
				toast.success('Respaldo importado. Tus datos actuales quedaron intactos.');
			}
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
			const refreshed = await finishImport();
			if (refreshed === false) {
				toast.error('El respaldo se restauró, pero la pantalla no pudo actualizarse. Recargá CopyNotes.');
			} else {
				toast.success('Respaldo restaurado desde cero.');
			}
		} catch {
			toast.error('No se pudo restaurar. Tus datos no cambiaron.');
		} finally {
			importing = false;
		}
	}

	async function finishImport() {
		const refreshed = await onDataChanged();
		step = 'idle';
		review = null;
		open = false;
		return refreshed;
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
	oncancel={(event) => {
		if (importing) event.preventDefault();
	}}
	onclose={() => {
		if (!importing) open = false;
	}}
	aria-labelledby="backup-title"
	class="cn-dialog bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="flex items-center justify-between border-b px-4 py-3">
		<h2 bind:this={titleEl} id="backup-title" tabindex="-1" class="text-sm font-bold focus:outline-none">Respaldo</h2>
		<button
			type="button"
			onclick={closeDialog}
			disabled={importing}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	{#if step === 'idle'}
		<div class="flex flex-col gap-5 px-4 py-4" in:fade={{ duration: motionDuration(MOTION.fast) }}>
			<p class="text-muted-foreground text-sm">
				Tus notas viven en este dispositivo. Si borrás los datos del navegador o cambiás de equipo
				sin un respaldo, se pierden. Descargá un respaldo cada tanto para quedarte tranquilo.
			</p>

			<section class="flex flex-col gap-2">
				<h3 class="text-xs font-bold tracking-wide uppercase text-muted-foreground">Exportar</h3>
				<button
					type="button"
					onclick={exportAllJson}
					disabled={exporting}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					<FileDown size={16} aria-hidden="true" />
					Descargar respaldo completo (JSON)
				</button>
				{#if currentNoteId}
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => exportCurrentNote('md')}
							disabled={exporting}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
						>
							Nota actual en Markdown
						</button>
						<button
							type="button"
							onclick={() => exportCurrentNote('html')}
							disabled={exporting}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
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
					onclick={chooseBackupFile}
					class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center gap-2 rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
				>
					<FileUp size={16} aria-hidden="true" />
					Elegir archivo de respaldo…
				</button>
			</section>
		</div>
	{:else if step === 'reviewing'}
		<div class="flex flex-col gap-4 px-4 py-4" in:fade={{ duration: motionDuration(MOTION.fast) }}>
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
						disabled={importing}
						class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onclick={() => (step = 'confirmingReplace')}
						disabled={importing}
						class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
					>
						Reemplazar todo…
					</button>
				</div>
			</div>
		</div>
	{:else if step === 'confirmingReplace'}
		<div class="flex flex-col gap-4 px-4 py-4" in:fade={{ duration: motionDuration(MOTION.fast) }}>
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
					disabled={importing}
					class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
				>
					Volver
				</button>
			</div>
		</div>
	{/if}
</dialog>
