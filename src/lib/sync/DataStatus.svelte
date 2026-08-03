<script>
	import { toast } from 'svelte-sonner';
	import { syncStatus } from './status.svelte';
	import { cloudConfigured } from './supabase';
	import {
		countConflicts,
		describeRecord,
		describeTable,
		isDeletion,
		keepLocal,
		listConflicts,
		takeRemote,
		undoDecision
	} from './conflicts';
	import { db } from '$lib/storage/db';
	import { haceCuanto } from '$lib/relative-time';
	import { tooltip } from '$lib/actions/tooltip';

	// El estado de tus datos, en un solo lugar: el guardado de este dispositivo
	// (el punto de siempre), la nube, y los conflictos que esperan una decisión.
	//
	// Antes estaba partido en dos: un punto que no se podía tocar y una sección de
	// Configuración. El engranaje es para decisiones —entrar, permitir, cerrar
	// sesión—, no para marcadores; y un conflicto en una nota que no tenés abierta
	// era invisible salvo que se te ocurriera ir a buscarlo ahí.
	let { open = $bindable(false), saveState = 'idle', onGoToRow, onDataChanged } = $props();

	// Las palabras viven acá y en el tooltip, nunca en el header: el ancho del
	// punto no puede cambiar con cada guardado o los íconos se mueven solos.
	const SAVE_LABELS = {
		idle: 'Todo guardado',
		saving: 'Guardando…',
		saved: 'Guardado hace un momento',
		error: 'No pudimos guardar'
	};

	let rootEl = $state();
	let buttonEl = $state();
	let panelEl = $state();
	let conflictList = $state([]);
	let busy = $state(false);
	let loaded = $state(false);

	const conflictCount = $derived(syncStatus.conflicts);
	const buttonLabel = $derived(
		conflictCount > 0
			? `Ver estado — ${SAVE_LABELS[saveState]}, ${conflictCount} ${conflictCount === 1 ? 'versión distinta espera' : 'versiones distintas esperan'} tu decisión`
			: `Ver estado — ${SAVE_LABELS[saveState]}`
	);

	// Cada lado del conflicto como lo reconoce una persona: las palabras, y en qué
	// nota está. Saber que hay tres no sirve de nada si no se sabe dónde.
	async function loadConflicts() {
		const rows = await listConflicts();
		// El contador lo mantiene el reloj de sincronización, que arranca un segundo
		// después de abrir la app: leerlo acá evita que el panel muestre una lista
		// mientras el punto todavía dice que no hay nada.
		syncStatus.conflicts = rows.length;
		conflictList = await Promise.all(
			rows.map(async (conflict) => {
				const local = await db.table(conflict.table).get(conflict.recordId);
				const noteId =
					conflict.table === 'blocks' ? (local?.noteId ?? conflict.remote?.noteId ?? null) : null;
				const note = noteId ? await db.table('notes').get(noteId) : null;
				return {
					id: conflict.id,
					label: note
						? `En "${note.title || 'Nota sin título'}"`
						: describeTable(conflict.table),
					mine: isDeletion(local) ? '(borrado acá)' : describeRecord(conflict.table, local),
					theirs: isDeletion(conflict.remote)
						? '(borrado en el otro dispositivo)'
						: describeRecord(conflict.table, conflict.remote),
					noteId: note ? noteId : null,
					blockId: conflict.table === 'blocks' ? conflict.recordId : null
				};
			})
		);
		loaded = true;
	}

	function toggle() {
		open = !open;
	}

	function close({ restoreFocus = false } = {}) {
		open = false;
		if (restoreFocus) buttonEl?.focus();
	}

	// Una lectura al arrancar. El contador lo mantiene el reloj de sincronización,
	// pero su primer tic llega un segundo tarde y sólo si hay nube configurada: sin
	// esto, algo que quedó esperando decisión de la sesión anterior no se ve hasta
	// que pasa un tic. Sin dependencias reactivas, así que corre una sola vez.
	$effect(() => {
		countConflicts().then((count) => (syncStatus.conflicts = count));
	});

	// La lista se lee al abrir, y otra vez si llega un conflicto nuevo con el panel
	// ya abierto: `conflictCount` viene del reloj de sincronización, no de acá.
	$effect(() => {
		if (!open) {
			loaded = false;
			return;
		}
		// Leer el contador acá registra la dependencia: si llega uno nuevo con el
		// panel abierto, la lista se vuelve a leer sola.
		void conflictCount;
		loadConflicts();
	});

	$effect(() => {
		if (!open) return;
		panelEl?.focus();
		function onPointerDown(event) {
			if (rootEl && !rootEl.contains(event.target)) close();
		}
		function onKeydown(event) {
			if (event.key === 'Escape') close({ restoreFocus: true });
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeydown);
		};
	});

	// Un punto en la esquina no grita. La primera vez que aparece un conflicto
	// nuevo va un aviso abajo; después vive en el punto, sin repetirse en cada tic
	// de sincronización. Guarda plana y no `$state`: el efecto no puede depender de
	// lo que él mismo escribe.
	let announced = syncStatus.conflicts;
	$effect(() => {
		const count = syncStatus.conflicts;
		const isNew = count > announced;
		announced = count;
		if (!isNew || open) return;
		toast('Llegó otra versión de algo que editaste acá.', {
			action: { label: 'Ver', onClick: () => (open = true) }
		});
	});

	// Un solo toque decide, así que el camino de vuelta también tiene que ser uno:
	// el aviso con "Deshacer" es la red, igual que al elegir desde el renglón.
	async function decide(id, choice) {
		busy = true;
		try {
			const undo = await (choice === 'mine' ? keepLocal(id) : takeRemote(id));
			await loadConflicts();
			onDataChanged?.();
			if (!undo) return;
			toast.success(
				choice === 'mine' ? 'Te quedaste con tu versión' : 'Trajiste la versión del otro aparato',
				{
					duration: 6000,
					action: {
						label: 'Deshacer',
						onClick: async () => {
							await undoDecision(undo);
							await loadConflicts();
							onDataChanged?.();
						}
					}
				}
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'No se pudo guardar tu elección.');
		} finally {
			busy = false;
		}
	}

	function goToRow(conflict) {
		close();
		onGoToRow?.(conflict.noteId, conflict.blockId);
	}
</script>

<div bind:this={rootEl} class="relative ml-1 flex items-center">
	<button
		bind:this={buttonEl}
		type="button"
		onclick={toggle}
		aria-expanded={open}
		aria-label={buttonLabel}
		use:tooltip={'Ver estado'}
		class="text-muted-foreground hover:bg-accent focus-visible:ring-ring flex h-(--touch-target) min-w-(--touch-target) items-center justify-center gap-1.5 rounded-md px-1 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
	>
		<span
			data-save-state={saveState}
			data-conflicts={conflictCount > 0 ? 'true' : null}
			class="cn-save-dot size-2 shrink-0 rounded-full data-[save-state=saving]:animate-pulse"
		></span>
		{#if conflictCount > 0}
			<!-- El número, no sólo el anillo: el color no puede ser la única señal
			     (spec 016), y un aro de 14px solo se pierde en la esquina. -->
			<span class="cn-conflict-count text-xs font-medium tabular-nums">{conflictCount}</span>
		{/if}
	</button>

	<!-- Lo que cambia sin que nadie lo pida se anuncia: el guardado y, sobre todo,
	     una versión nueva esperando decisión. -->
	<span aria-live="polite" class="sr-only">
		{saveState === 'idle' ? '' : SAVE_LABELS[saveState]}
		{conflictCount > 0
			? `${conflictCount} ${conflictCount === 1 ? 'versión distinta espera' : 'versiones distintas esperan'} tu decisión.`
			: ''}
	</span>

	{#if open}
		<div
			bind:this={panelEl}
			tabindex="-1"
			role="dialog"
			aria-label="Estado de tus datos"
			class="cn-pop border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-2 flex max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-y-auto overscroll-contain rounded-md border p-3 shadow-md focus-visible:outline-none"
		>
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium">{SAVE_LABELS[saveState]}</p>
				{#if !cloudConfigured()}
					<p class="text-faint text-xs">Sólo en este dispositivo: no hay nube configurada.</p>
				{:else}
					<p class="text-muted-foreground text-xs">
						{#if syncStatus.uploading}
							Sincronizando…
						{:else if syncStatus.pending === 0}
							Todo subido.
						{:else}
							{syncStatus.pending}
							{syncStatus.pending === 1 ? 'cambio sin subir' : 'cambios sin subir'}.
						{/if}
						{#if syncStatus.lastUploadAt}
							Última subida {haceCuanto(syncStatus.lastUploadAt)}.
						{/if}
					</p>
					{#if syncStatus.peers > 0}
						<p class="text-faint text-xs">
							En vivo: {syncStatus.peers}
							{syncStatus.peers === 1 ? 'dispositivo más' : 'dispositivos más'} — los cambios viajan
							en segundos.
						</p>
					{/if}
					{#if syncStatus.error}
						<p class="text-destructive text-xs">{syncStatus.error}</p>
					{/if}
				{/if}
			</div>

			{#if conflictCount > 0}
				<div class="border-border flex flex-col gap-3 border-t pt-3">
					<p class="text-sm">
						{conflictCount}
						{conflictCount === 1 ? 'versión distinta' : 'versiones distintas'}: lo editaste acá y
						también en otro dispositivo. No se pisó nada — elegí cuál queda.
					</p>
					{#each conflictList as conflict (conflict.id)}
						<div class="flex min-w-0 flex-col gap-2 text-sm">
							<span class="text-faint text-xs">{conflict.label}</span>
							<div class="flex flex-col gap-1">
								<span class="text-muted-foreground text-xs">Acá:</span>
								<span class="bg-muted rounded px-2 py-1 break-words">{conflict.mine || '(vacío)'}</span>
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-muted-foreground text-xs">Allá:</span>
								<span class="bg-muted rounded px-2 py-1 break-words">{conflict.theirs || '(vacío)'}</span>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onclick={() => decide(conflict.id, 'mine')}
									disabled={busy}
									class="bg-primary text-primary-foreground focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
								>
									Quedarme con el mío
								</button>
								<button
									type="button"
									onclick={() => decide(conflict.id, 'theirs')}
									disabled={busy}
									class="border-border text-foreground hover:bg-accent focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
								>
									Traer el otro
								</button>
								{#if conflict.noteId && conflict.blockId}
									<button
										type="button"
										onclick={() => goToRow(conflict)}
										class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md px-1 py-1.5 text-xs underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
									>
										Ir al renglón
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else if loaded}
				<p class="text-muted-foreground border-border border-t pt-3 text-sm">Todo al día.</p>
			{/if}
		</div>
	{/if}
</div>
