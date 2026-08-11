<script>
	import { Trash2 } from '@lucide/svelte';
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
	import { diffWords } from './diff';
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
				const localDeleted = isDeletion(local);
				return {
					id: conflict.id,
					// Todo lo de una misma nota va junto. Sin esto, borrar una nota
					// tocada en los dos aparatos servía la lista renglón por renglón —59
					// decisiones idénticas, sin decir en ningún lado que eran la misma.
					groupKey: noteId ?? conflict.table,
					label: note
						? `En "${note.title || 'Nota sin título'}"`
						: describeTable(conflict.table),
					mine: localDeleted
						? '(borrado en este dispositivo)'
						: describeRecord(conflict.table, local),
					theirs: isDeletion(conflict.remote)
						? '(borrado en el otro dispositivo)'
						: describeRecord(conflict.table, conflict.remote),
					remoteDeleted: isDeletion(conflict.remote),
					localDeleted,
					// Un renglón borrado acá no está en pantalla, y una nota borrada no
					// se puede abrir: `openFromAgenda` la busca en la lista viva, no la
					// encuentra y se vuelve sin decir nada. Ofrecer "Ir al renglón" ahí
					// era un enlace a un lugar que ya no existe — se tocaba y no pasaba
					// nada.
					canGoToRow: Boolean(noteId) && !localDeleted && !isDeletion(note),
					noteId,
					blockId: conflict.table === 'blocks' ? conflict.recordId : null
				};
			})
		);
		loaded = true;
	}

	// Una nota, una decisión. El orden de la lista se respeta: el primer conflicto
	// de cada nota fija dónde aparece esa nota.
	const conflictGroups = $derived.by(() => {
		const groups = [];
		const byKey = new Map();
		for (const conflict of conflictList) {
			let group = byKey.get(conflict.groupKey);
			if (!group) {
				group = { key: conflict.groupKey, label: conflict.label, items: [] };
				byKey.set(conflict.groupKey, group);
				groups.push(group);
			}
			group.items.push(conflict);
		}
		return groups;
	});

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
		toast('Llegó otra versión de algo que editaste en este dispositivo.', {
			action: { label: 'Ver', onClick: () => (open = true) }
		});
	});

	// Un solo toque decide, así que el camino de vuelta también tiene que ser uno:
	// el aviso con "Deshacer" es la red, igual que al elegir desde el renglón. Vale
	// para uno o para una nota entera — decidir de a 59 y tener que deshacer de a
	// uno sería una trampa, así que el Deshacer del grupo revierte el grupo.
	async function decide(ids, choice) {
		busy = true;
		try {
			const undos = [];
			for (const id of ids) {
				const undo = await (choice === 'mine' ? keepLocal(id) : takeRemote(id));
				if (undo) undos.push(undo);
			}
			await loadConflicts();
			onDataChanged?.();
			// Sin nada más que decidir, el panel se va solo: quedó abierto tapando la
			// nota por una decisión que ya se tomó. Si quedan, se queda para la
			// siguiente.
			if (conflictList.length === 0) close();
			if (!undos.length) return;
			const many = undos.length > 1;
			toast.success(
				choice === 'mine'
					? many
						? `Te quedaste con lo de este dispositivo (${undos.length})`
						: 'Te quedaste con tu versión'
					: many
						? `Trajiste lo del otro dispositivo (${undos.length})`
						: 'Trajiste la versión del otro aparato',
				{
					duration: 6000,
					action: {
						label: 'Deshacer',
						onClick: async () => {
							for (const undo of undos) await undoDecision(undo);
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
					{#if syncStatus.offline}
						<!-- No es rojo a propósito: no llegar al servidor es un estado
						     previsto, no algo roto. Lo escrito está guardado acá y el próximo
						     intento sale solo. -->
						<p class="text-muted-foreground text-xs" title={syncStatus.errorDetail ?? undefined}>
							Sin conexión con la nube{syncStatus.pending > 0
							? `: ${syncStatus.pending === 1 ? 'ese cambio sube solo' : 'esos cambios suben solos'} cuando vuelva.`
							: '. Se reintenta solo.'}
						</p>
					{:else if syncStatus.error}
						<p class="text-destructive text-xs" title={syncStatus.errorDetail ?? undefined}>
							{syncStatus.error}
						</p>
					{/if}
				{/if}
			</div>

			{#if conflictCount > 0}
				<div class="border-border flex flex-col gap-3 border-t pt-3">
					<p class="text-sm">
						{conflictCount}
						{conflictCount === 1 ? 'versión distinta' : 'versiones distintas'}: lo editaste en este
						dispositivo y también en otro. No se pisó nada — elegí cuál queda.
					</p>
					{#each conflictGroups as group (group.key)}
						{@const many = group.items.length > 1}
						{@const allRemoteDeleted = group.items.every((item) => item.remoteDeleted)}
						{@const allLocalDeleted = group.items.every((item) => item.localDeleted)}
						{@const ids = group.items.map((item) => item.id)}
						<div class="flex min-w-0 flex-col gap-1 text-sm">
							<span class="text-faint text-xs">
								{group.label}{many ? ` — ${group.items.length} renglones` : ''}
							</span>

							{#if allLocalDeleted && !allRemoteDeleted}
								<!-- El contexto que faltaba. Sin esta línea, la persona ve una pila
								     de "(borrado en este dispositivo)" sin entender por qué le
								     preguntan: fue ELLA quien borró, y lo que la app necesita saber
								     es si ese borrado vale también para el otro aparato. -->
								<p class="text-muted-foreground text-xs">
									Lo borraste en este dispositivo. En el otro sigue existiendo, con cambios.
								</p>
							{/if}

							{#if many}
								<!-- Una nota, una decisión. 59 elecciones idénticas no son 59
								     decisiones: son una, servida 59 veces. -->
								<button
									type="button"
									onclick={() => decide(ids, 'mine')}
									disabled={busy}
									class="cn-conflict-bulk"
								>
									Quedarme con lo de este dispositivo
								</button>
								<button
									type="button"
									onclick={() => decide(ids, 'theirs')}
									disabled={busy}
									class="cn-conflict-bulk {allRemoteDeleted ? 'cn-conflict-option--danger' : ''}"
								>
									{#if allRemoteDeleted}
										<Trash2 size={13} aria-hidden="true" />
										Borrarlos también en este dispositivo
									{:else}
										Traer lo del otro dispositivo
									{/if}
								</button>
								<!-- `<details>` nativo: la lista larga existe para quien quiera
								     revisarla renglón por renglón, pero cerrada por omisión — abierta
								     tapa el resto del panel y esconde las otras notas. -->
								<details class="cn-conflict-details">
									<summary>Revisar renglón por renglón</summary>
									<div class="mt-1 flex flex-col gap-2">
										{#each group.items as conflict (conflict.id)}
											{@render conflictRow(conflict)}
										{/each}
									</div>
								</details>
							{:else}
								{@render conflictRow(group.items[0])}
							{/if}
						</div>
					{/each}
				</div>
			{:else if loaded}
				<p class="text-muted-foreground border-border border-t pt-3 text-sm">Todo al día.</p>
			{/if}
		</div>
	{/if}
</div>

<!-- Las versiones SON la elección: un toque y listo, igual que en el propio
     renglón. Un botón aparte convierte una decisión de un gesto en dos, y encima
     obliga a leer el texto en un lado y apretar en otro. Lo que cambió va
     subrayado en las dos. -->
{#snippet conflictRow(conflict)}
	{@const versions = diffWords(conflict.mine, conflict.theirs)}
	<div class="flex min-w-0 flex-col gap-1">
		<button
			type="button"
			onclick={() => decide([conflict.id], 'mine')}
			disabled={busy}
			aria-label="Quedarme con esta versión, la de este dispositivo"
			class="cn-conflict-option"
		>
			<span class="cn-conflict-side" aria-hidden="true">Tu versión</span>
			<span class="cn-conflict-text min-w-0 flex-1 break-words whitespace-pre-wrap"
				>{#each versions.mine as part, index (index)}{#if part.changed}<span class="cn-diff"
							>{part.text}</span
						>{:else}{part.text}{/if}{/each}{#if !conflict.mine}<span
						class="text-muted-foreground italic">(vacío)</span
					>{/if}</span
			>
		</button>
		<button
			type="button"
			onclick={() => decide([conflict.id], 'theirs')}
			disabled={busy}
			aria-label={conflict.remoteDeleted
				? 'Borrar esto en este dispositivo, como se borró en el otro'
				: 'Traer esta versión, la del otro dispositivo'}
			class="cn-conflict-option {conflict.remoteDeleted ? 'cn-conflict-option--danger' : ''}"
		>
			<span class="cn-conflict-side" aria-hidden="true">La del otro</span>
			{#if conflict.remoteDeleted}
				<!-- No es "quedate con este texto" sino "borralo". Se dice como una
				     acción, igual que en el renglón: descrito como estado —"(borrado en el
				     otro dispositivo)"— se lee como un cartel y no como la opción que es. -->
				<span class="flex min-w-0 flex-1 items-center gap-1.5">
					<Trash2 size={13} aria-hidden="true" />
					{conflict.blockId ? 'Borrar este renglón' : 'Borrarlo también en este dispositivo'}
				</span>
			{:else}
				<span class="cn-conflict-text min-w-0 flex-1 break-words whitespace-pre-wrap"
					>{#each versions.theirs as part, index (index)}{#if part.changed}<span class="cn-diff"
								>{part.text}</span
							>{:else}{part.text}{/if}{/each}{#if !conflict.theirs}<span
							class="text-muted-foreground italic">(vacío)</span
						>{/if}</span
				>
			{/if}
		</button>
		{#if conflict.canGoToRow && conflict.blockId}
			<button
				type="button"
				onclick={() => goToRow(conflict)}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-md px-1 py-1 text-xs underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
			>
				Ir al renglón
			</button>
		{/if}
	</div>
{/snippet}
