<script>
	import { toast } from 'svelte-sonner';
	import { fade } from 'svelte/transition';
	import { FileDown, FileUp, X } from '@lucide/svelte';
	import { MOTION, motionDuration } from '$lib/motion';
	import {
		backupFileName,
		buildBackup,
		buildPackage,
		filterSafeSettings,
		noteExportFileName,
		noteToHtml,
		noteToMarkdown,
		packageFileName,
		planMerge,
		readPackage,
		referencedImageIds,
		validateBackup
	} from '$lib/export-import';
	import { getBody, listBodyIds, putBody } from '$lib/images/bodies';
	import { detectImageType } from '$lib/images/ingest';
	import { roomIsTight } from '$lib/images/doors';
	import { sanitizeBackupData } from '$lib/format';
	// The version stamped into every backup file, read from package.json instead
	// of typed here: it used to say 0.0.1 while Tauri, Cargo and the MCP package
	// all said 0.1.0, so a restored file named a version that never shipped.
	// Vite inlines just this named export, not the whole manifest.
	import { version as APP_VERSION } from '../../../package.json';
	import { getBackupSource, openBinaryFile, saveBinaryFile, saveTextFile } from '$lib/platform';
	// Spec 039: restaurar reemplaza también la copia de la nube, y el cartel lo dice.
	import { claimAccountAfterRestore, restoreReachesCloud } from '$lib/sync/restore';
	import {
		applyMergePlan,
		chooseBackupFormat,
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
	// Las capturas que trae el archivo elegido, ya comprobadas por `readPackage`.
	// Sin `$state`: nada del dibujo depende de ellas y son Blobs.
	let pendingBodies = [];
	let importing = $state(false);
	let exporting = $state(false);
	// Si el cartel de "Reemplazar todo" va a hablar de la nube. Se lee al entrar a
	// ese paso y no con `$derived`: es una pregunta a la base y a la sesión, no un
	// valor que se calcule de lo que ya está en pantalla.
	let replaceReachesCloud = $state(false);

	let titleEl = $state(null);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			step = 'idle';
			dropReview();
			dialogEl.showModal();
			// showModal() auto-focuses the first tabbable element (the X), which
			// reads as if the close button were pre-pressed. Park focus on the
			// heading instead so nothing looks activated on open.
			titleEl?.focus();
		} else if (!open && dialogEl.open && !importing) {
			dialogEl.close();
		}
	});

	// Un solo lugar que suelta la revisión, porque son DOS cosas que hay que soltar
	// juntas: `pendingBodies` son Blobs y quedarse con ellos mantiene vivas las
	// capturas del archivo hasta la próxima importación.
	function dropReview() {
		review = null;
		pendingBodies = [];
	}

	function closeDialog() {
		if (!importing) {
			dropReview();
			open = false;
		}
	}

	// `QuotaExceededError` llega envuelto por Dexie, así que se mira el nombre acá
	// y en la causa. Es lo único que la persona puede accionar de todos los
	// motivos por los que una importación puede fallar.
	function outOfRoom(error) {
		return error?.name === 'QuotaExceededError' || error?.inner?.name === 'QuotaExceededError';
	}

	async function exportBackup() {
		exporting = true;
		try {
			// La barrera corre igual dentro de `dumpAllTables`; acá se la llama antes
			// sólo para quedarse con la respuesta. Si algo no aterrizó, el archivo se
			// baja lo mismo (mejor un respaldo al que le falta un renglón que ninguno)
			// pero el mensaje no puede decir que está completo.
			const allSaved = await settlePendingWrites();
			const backup = buildBackup(await dumpAllTables(), {
				appVersion: APP_VERSION,
				exportedAt: new Date().toISOString(),
				source: getBackupSource()
			});
			// La app revisa el respaldo que ella misma acaba de armar. Sin esto un archivo
			// roto se baja en silencio y te enterás el día que lo necesitás — que es
			// exactamente lo que pasó el 2026-08-15 (spec 040, regla 7).
			//
			// Se baja IGUAL: un respaldo al que le falta un renglón sirve más que ninguno,
			// el mismo criterio que `settlePendingWrites`. Lo que cambia es que el mensaje
			// no puede decir que está sano.
			//
			// Sobre una copia: `validateBackup` normaliza carpetas y posiciones en el objeto
			// que recibe, y lo que se escribe en el archivo no lo puede tocar la revisión.
			const selfCheck = validateBackup(JSON.parse(JSON.stringify(backup)));
			// Spec 041 §5.1: si alguna nota tiene una captura —la papelera cuenta— el
			// archivo deja de ser un `.json` suelto y pasa a ser un paquete
			// `.copynotes` con los bytes adentro. Sin capturas no cambia una coma.
			let result;
			let complete = true;
			if (chooseBackupFormat(backup.data.blocks) === 'copynotes') {
				const ids = [...referencedImageIds(backup.data.blocks)];
				const bodies = (await Promise.all(ids.map(getBody))).filter(Boolean);
				// `complete` lo decide `buildPackage` comprobando cada huella, nunca
				// lo que este llamador crea tener (spec §5.4).
				const packaged = await buildPackage(backup, bodies);
				complete = packaged.complete;
				result = await saveBinaryFile({
					fileName: packageFileName(new Date()),
					blob: packaged.blob
				});
			} else {
				result = await saveTextFile({
					fileName: backupFileName(new Date()),
					content: JSON.stringify(backup, null, 2),
					mimeType: 'application/json'
				});
			}
			if (result.status !== 'saved') return;
			// Los tres son problemas DISTINTOS y pueden pasar juntos: una cadena de
			// `else if` contaba el primero y se callaba los otros. Un respaldo al que
			// le falta una captura y lo dice vale más que uno que se declara entero
			// (spec §5.4), y lo mismo vale para cada uno de los tres.
			const problems = [];
			if (!selfCheck.ok)
				problems.push(
					'Respaldo descargado, pero al revisarlo le encontramos un problema. Guardalo igual y avisanos.'
				);
			if (!complete) problems.push('Se guardó el respaldo, pero le falta alguna imagen.');
			if (!allSaved)
				problems.push('Respaldo descargado — un cambio reciente no se pudo guardar y puede faltar.');
			if (problems.length === 0) toast.success('Respaldo descargado');
			else for (const problem of problems) toast.warning(problem);
		} catch {
			toast.error('No se pudo guardar el respaldo. Tus datos siguen intactos.');
		} finally {
			exporting = false;
		}
	}

	async function exportCurrentNote(format) {
		exporting = true;
		try {
			// Mismo trato que el respaldo: el archivo sale igual, pero si un guardado
			// no aterrizó el mensaje no puede decir que la nota está entera.
			const allSaved = await settlePendingWrites();
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
			if (result.status !== 'saved') return;
			// Spec 041 §8: un `blob:` no existe fuera de CopyNotes, así que el
			// archivo lleva `[Imagen: descripción]` en su lugar (note-export.ts) — y
			// esto es lo único que puede avisarlo, porque el archivo ya se guardó.
			//
			// Y en una lista, no en una cadena de `else if`, por lo mismo que el
			// respaldo de acá arriba: los dos problemas son DISTINTOS y pasan juntos
			// —una nota con capturas cuyo último cambio no aterrizó—, y encadenados
			// se contaba el primero y se callaba el otro.
			const problems = [];
			if (!allSaved)
				problems.push('Nota exportada — un cambio reciente no se pudo guardar y puede faltar.');
			if (blocks.some((block) => block.type === 'image'))
				problems.push('Nota exportada — las imágenes no se incluyeron, sólo su descripción.');
			if (problems.length === 0) toast.success('Nota exportada');
			else for (const problem of problems) toast.warning(problem);
		} catch {
			toast.error('No se pudo exportar la nota. Tus datos siguen intactos.');
		} finally {
			exporting = false;
		}
	}

	async function chooseBackupFile() {
		let opened;
		try {
			// Se lee en bytes y no en texto porque un `.copynotes` es un ZIP:
			// `file.text()` lo decodificaría como UTF-8 y perdería los bytes de las
			// capturas sin decir nada. Quién es cuál lo decide la firma del archivo
			// —no su nombre— adentro de `openBinaryFile`, que además le pone a cada
			// uno su techo de peso.
			opened = await openBinaryFile({ accept: '.json,.copynotes' });
		} catch {
			toast.error('Ese archivo no se puede leer como respaldo de CopyNotes.');
			return;
		}
		if (opened.status === 'cancelled') return;
		if (opened.status === 'too-large') {
			toast.error(
				opened.packaged
					? 'Ese paquete pesa más de 1 GB. Un respaldo de CopyNotes pesa muchísimo menos.'
					: 'Ese archivo pesa más de 64 MB. Un respaldo de CopyNotes pesa muchísimo menos.'
			);
			return;
		}
		const packaged = opened.packaged;
		const raw = new Uint8Array(opened.bytes);
		let parsed;
		let imageBytes = null;
		if (packaged) {
			// Todo lo que puede rechazar un paquete corre acá, antes de tocar un solo
			// renglón de la base (spec §5.3/§5.5): nombres, cuenta, tamaños y la
			// huella de cada captura.
			let read;
			try {
				read = await readPackage(raw);
			} catch {
				read = { status: 'not-a-package' };
			}
			if (read.status !== 'ok') {
				// Ocho de los nueve rechazos comparten una sola salida porque no hay
				// nada distinto que hacer con ninguno. `compressed-entry` no: significa
				// que alguien descomprimió el paquete, le agregó algo y lo volvió a
				// comprimir, y eso sí tiene arreglo — volver a exportar. Decirle
				// "dañado" lo manda a buscar un problema que no existe.
				toast.error(
					read.status === 'compressed-entry'
						? 'Ese paquete se volvió a comprimir con otro programa y CopyNotes ya no puede abrirlo. Usá el archivo tal como lo bajaste, o exportá uno nuevo.'
						: 'Ese paquete .copynotes está dañado o no es un respaldo de CopyNotes. No se importó nada.'
				);
				return;
			}
			parsed = read.backup;
			imageBytes = read.images;
		} else {
			try {
				parsed = JSON.parse(new TextDecoder().decode(raw));
			} catch {
				toast.error('Ese archivo no se puede leer como respaldo de CopyNotes.');
				return;
			}
		}
		let local;
		try {
			local = await dumpAllTables();
		} catch {
			toast.error('No se pudieron guardar tus últimos cambios. No se importó nada.');
			return;
		}
		// Revisar y planificar, con red: nada de acá escribe en la base, pero si algo
		// revienta —un archivo raro que sortea la validación, un caño nuevo que rompe el
		// plan— sin este `try` la excepción se va al vacío y la pantalla no dice NADA.
		// Fallar en silencio es la peor forma de fallar, y en este mismo camino ya pasó
		// una vez por otro motivo (el selector de archivos, `platform/files.js`).
		let result;
		let plan;
		let standalone;
		try {
			result = validateBackup(
				parsed,
				{
					existingNoteIds: local.notes.map((row) => row.id),
					existingBlockIds: local.blocks.map((row) => row.id),
					existingTagIds: local.tags.map((row) => row.id),
					existingSnippetIds: local.snippets.map((row) => row.id)
				},
				// La versión 6 sólo se acepta si vino de adentro de un paquete: un
				// `.json` suelto que la declara está mintiendo sobre su propia forma,
				// porque los bytes no pueden estar ahí (spec §5.3).
				{ packaged }
			);
			if (result.ok) {
				// Ingest gate: ningún html llega a la base sin pasar por la limpieza. Los
				// dos caminos la tienen: el plan del merge, y `replaceData` más abajo.
				//
				// Se compara ANTES de limpiar y se limpia lo que se va a ESCRIBIR, en ese
				// orden. `plainTextToHtml` guarda la comilla como `&quot;` y `sanitizeHtml`
				// la reescribe como `"`: la misma frase, dos formas, y comparar la fila
				// limpia del archivo contra la guardada sin limpiar hacía parecer cambiado
				// todo renglón con una comilla adentro. Medido con el archivo real de
				// Hernán: **326 de 1450 bloques**, duplicados sin que se moviera una letra
				// (spec 040, gate 2026-08-16). La regla y el bug están escritos en
				// `export-import/merge.sanitize.test.ts`.
				plan = planMerge(local, result.backup.data);
				plan.inserts = sanitizeBackupData(plan.inserts);
				standalone = validateBackup(parsed, undefined, { packaged });
			}
		} catch {
			toast.error('No se pudo revisar ese archivo. No se importó nada y tus notas siguen igual.');
			return;
		}
		if (!result.ok) {
			toast.error(result.errors[0] ?? 'El archivo no es un respaldo válido.');
			return;
		}
		// La validación de arriba cuenta tus notas como existentes, que es lo
		// correcto para importar sumando. "Reemplazar todo" borra lo tuyo ANTES de
		// escribir el archivo, así que ahí el archivo tiene que sostenerse solo:
		// se revalida sin tus ids, o una referencia que se apoyaba en una nota tuya
		// queda colgando después del borrado.
		// Y un archivo que no se declara una copia COMPLETA tampoco puede reemplazar
		// todo: el borrado se llevaría lo que el archivo no puede reponer (spec 040,
		// regla 6). Ausente = completo, así que los archivos de siempre no cambian.
		const complete = standalone.ok && standalone.backup.complete === true;
		const replaceData = complete ? sanitizeBackupData(standalone.backup.data) : null;
		// Se camina lo que el paquete TRAE, no lo que su manifiesto declara. Al
		// revés, una captura que `readPackage` ya comprobó —nombre, huella y un
		// bloque que la referencia— pero que no figura en `images` se tiraba en
		// silencio, y tirar algo en silencio es el error que este proyecto ya pagó
		// más de una vez. El manifiesto queda sólo para el alto y el ancho.
		//
		// El tipo y el peso salen de los bytes: la huella comprobada es de ellos.
		// Fuera de `$state` a propósito: la pantalla no los mira, son Blobs, y un
		// proxy de Svelte no se puede clonar hacia IndexedDB. Se pisa entero en cada
		// elección de archivo, así que no puede quedar viejo.
		const declared = new Map(result.backup.images.map((meta) => [meta.imageId, meta]));
		pendingBodies = [...(imageBytes ?? [])].map(([imageId, data]) => {
			const meta = declared.get(imageId);
			// Los bytes y nada más: `readPackage` ya rechazó el paquete entero si la
			// firma real de alguna entrada no era la que decía ser, así que acá el
			// olfato SIEMPRE contesta. Cayendo al tipo del manifiesto —el que
			// escribió quien armó el archivo— eran bytes cualesquiera etiquetados
			// `image/png`, que es justo lo que la firma existe para impedir.
			const type = detectImageType(data) ?? '';
			return {
				imageId,
				blob: new Blob([data], { type }),
				type,
				bytes: data.length,
				width: meta?.width ?? null,
				height: meta?.height ?? null
			};
		});
		review = {
			fileName: opened.fileName,
			warnings: result.warnings,
			plan,
			replaceData,
			incomplete: standalone.ok && !complete
		};
		step = 'reviewing';
	}

	async function applyMerge() {
		importing = true;
		try {
			// Los bytes primero y los bloques después (spec §5.5). Un cuerpo huérfano
			// no se ve y se puede recuperar; un bloque que apunta a bytes que no
			// están es una imagen rota en pantalla.
			//
			// Los que este aparato ya tiene NO se reescriben: la huella ES el
			// contenido, así que no habría nada nuevo que guardar, y `imageBodyRow`
			// pone `uploadedFor: null` — reimportar tu propio respaldo marcaría cada
			// captura ya subida como pendiente de subir de nuevo.
			const known = new Set(await listBodyIds());
			for (const body of pendingBodies) {
				if (!known.has(body.imageId)) await putBody(body);
			}
			// $state proxies can't be structured-cloned into IndexedDB.
			await applyMergePlan($state.snapshot(review.plan));
			const refreshed = await finishImport();
			if (refreshed === false) {
				toast.error('El respaldo se importó, pero la pantalla no pudo actualizarse. Recargá CopyNotes.');
			} else {
				toast.success('Respaldo importado. Tus datos actuales quedaron intactos.');
			}
		} catch (error) {
			toast.error(
				outOfRoom(error)
					? 'No hay espacio en este aparato para todo lo que trae el respaldo. No se importó.'
					: 'No se pudo importar. Tus datos no cambiaron.'
			);
		} finally {
			importing = false;
		}
	}

	async function applyReplaceAll() {
		importing = true;
		try {
			const data = $state.snapshot(review.replaceData);
			// Aviso, NO permiso (spec §3.6): la estimación orienta y nunca cancela; la
			// última palabra la tiene el aparato con su `QuotaExceededError`. Es el
			// mismo `roomIsTight` y el mismo criterio que al pegar una captura.
			// Importar un `.copynotes` es la escritura más grande que hace la app, y
			// §5.5 pide mirar el espacio antes de borrar nada.
			const weight = pendingBodies.reduce((total, body) => total + body.bytes, 0);
			if (weight > 0 && (await roomIsTight({ size: weight })))
				toast.warning('Queda poco espacio en este aparato. Puede que alguna imagen no entre.');
			// Los cuerpos viajan adentro de la misma transacción que las filas: ahí
			// se borran los de la base anterior —`imageBodies` no está en
			// `BACKUP_TABLES`— y se escriben estos antes que los bloques (spec §5.5).
			await replaceAllTables(
				{ ...data, settings: filterSafeSettings(data.settings) },
				pendingBodies
			);
		} catch (error) {
			toast.error(
				outOfRoom(error)
					? 'No hay espacio en este aparato para todo lo que trae el respaldo. Tus datos no cambiaron.'
					: 'No se pudo restaurar. Tus datos no cambiaron.'
			);
			importing = false;
			return;
		}
		// Desde acá el aparato YA está restaurado, así que ningún mensaje puede decir
		// "tus datos no cambiaron": sería mentira. La nube es un segundo intento
		// posible (volver a restaurar el archivo); el restore local no.
		let claimed = false;
		try {
			claimed = await claimAccountAfterRestore();
		} catch {
			toast.error(
				'Tus notas se restauraron en este dispositivo, pero no se pudo reemplazar la copia de la nube. Volvé a restaurar el archivo cuando tengas conexión.'
			);
		}
		try {
			const refreshed = await finishImport();
			if (refreshed === false) {
				toast.error('El respaldo se restauró, pero la pantalla no pudo actualizarse. Recargá CopyNotes.');
			} else if (claimed) {
				toast.success('Respaldo restaurado desde cero. La nube ya tiene esta versión.');
			} else {
				toast.success('Respaldo restaurado desde cero.');
			}
		} finally {
			importing = false;
		}
	}

	async function finishImport() {
		const refreshed = await onDataChanged();
		step = 'idle';
		dropReview();
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
		if (!importing) {
			dropReview();
			open = false;
		}
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
					onclick={exportBackup}
					disabled={exporting}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					<FileDown size={16} aria-hidden="true" />
					Descargar respaldo completo
				</button>
				<!-- Va acá y no en el resumen de después: el riesgo se crea al bajar el
				     archivo, así que la frase tiene que leerse antes de la decisión, no
				     después (spec 040, decisión 2). -->
				<p class="text-muted-foreground text-xs">
					El archivo se lee con cualquier editor de texto: no tiene contraseña. Lleva todas tus
					notas, <span class="text-foreground">incluidas las que borraste</span> — por eso
					restaurar te las puede devolver. Quien lo reciba puede leer todo.
				</p>
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
				{#if review.incomplete}
					<p class="text-muted-foreground mt-1">
						Este archivo no es una copia completa: el aparato que lo bajó no tenía todo. Se puede
						importar sumándolo a lo tuyo, pero no reemplazar todo con él.
					</p>
				{:else if !review.replaceData}
					<p class="text-muted-foreground mt-1">
						Este archivo está incompleto: se apoya en notas que ya tenés. Se puede importar
						sumándolo a lo tuyo, pero no reemplazar todo con él.
					</p>
				{/if}
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
							dropReview();
						}}
						disabled={importing}
						class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
					>
						Cancelar
					</button>
					{#if review.replaceData}
						<button
							type="button"
							onclick={async () => {
								replaceReachesCloud = await restoreReachesCloud();
								step = 'confirmingReplace';
							}}
							disabled={importing}
							class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) flex-1 items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
						>
							Reemplazar todo…
						</button>
					{/if}
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
			<!-- Spec 039. La persona tiene derecho a saber que esto le llega al
			     teléfono que dejó en la mesa. Sólo cuando es cierto: en un aparato sin
			     nube, la frase sobra y asusta. -->
			{#if replaceReachesCloud}
				<p class="text-muted-foreground text-sm">
					También reemplaza <span class="text-foreground font-bold">la copia de la nube</span>: este
					archivo pasa a ser la versión buena de tu cuenta, y tus otros dispositivos van a quedar
					igual que este.
				</p>
			{/if}
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
