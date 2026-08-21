<script>
	import {
		MoreHorizontal,
		BookmarkPlus,
		Tag,
		StickyNote,
		ArrowUp,
		ArrowDown,
		Trash2
	} from '@lucide/svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { flipIntoView } from '$lib/actions/flipIntoView';
	import { virtualKeyboardOpen } from '$lib/actions/keyboardInset';

	// The 3-dots menu holding every block action except the always-visible copy
	// buttons (editor UX pass). Each item shows its typed quick key when it has
	// one. onDismiss returns focus to the block when the menu closes without
	// handing focus to another surface (Escape, click-away, snippet).
	// contentActions=false para renglones sin texto (el separador): quedan sólo
	// mover y eliminar. Comentario, snippet y etiqueta no tienen a qué agarrarse.
	let {
		onAddNote,
		onMoveUp,
		onMoveDown,
		onDelete,
		onSaveSnippet,
		onTag,
		onDismiss,
		open = false,
		onOpenChange,
		pulseMenu = false,
		contentActions = true,
		// El invitado de una nota compartida (spec 038 §6): de las seis puertas de
		// este menú queda UNA, la de comentar. Las otras cinco escriben el renglón,
		// y eso es exactamente lo que no puede hacer.
		noteOnly = false
	} = $props();

	let rootEl = $state();

	// Tocar "..." no es escribir. Con el teclado en pantalla quedan ~350px
	// visibles y el menú no entra ni arriba ni abajo del renglón; bajándolo hay
	// pantalla de sobra. Sin teclado no hace nada, así que en la compu no cambia.
	//
	// Se baja moviendo el foco A ESTE BOTÓN, no soltándolo con blur: los
	// controles del renglón se muestran con :focus-within de la fila (BlockRow),
	// así que un blur a secas los apagaba enteros —la hoja incluida— justo al
	// abrirla. El botón ya vive dentro de la fila, y el teclado baja igual porque
	// iOS sólo lo muestra para campos editables.
	function toggleOpen(event) {
		if (!open && virtualKeyboardOpen()) event.currentTarget.focus({ preventScroll: true });
		if (!open) document.dispatchEvent(new CustomEvent('copynotes:block-actions-open'));
		onOpenChange?.(!open);
	}

	$effect(() => {
		if (!open) return;
		function onPointerDown(event) {
			if (rootEl && !rootEl.contains(event.target)) {
				onOpenChange?.(false);
				onDismiss?.();
			}
		}
		function onKeydown(event) {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				onOpenChange?.(false);
				onDismiss?.();
			}
		}
		function onOtherMenu() {
			onOpenChange?.(false);
		}
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeydown);
		document.addEventListener('copynotes:block-actions-open', onOtherMenu);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('copynotes:block-actions-open', onOtherMenu);
		};
	});

	// restoreFocus false for actions that open another surface (tag picker).
	function run(action, restoreFocus = true) {
		onOpenChange?.(false);
		action();
		if (restoreFocus) onDismiss?.();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={rootEl} class="relative" onpointerdown={(event) => event.stopPropagation()}>
	<button
		type="button"
		aria-label="Más acciones"
		aria-haspopup="menu"
		aria-expanded={open}
		use:tooltip={'Más acciones'}
		onmousedown={(event) => event.preventDefault()}
		onclick={toggleOpen}
		class="cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none {open
			? 'text-foreground'
			: ''} {pulseMenu ? 'cn-pulse' : ''}"
	>
		<MoreHorizontal size={14} aria-hidden="true" />
	</button>

	{#if open}
		<!-- Cuelga del renglón en toda pantalla: así se ve de qué línea es. Se da
		     vuelta si no entra abajo pero sí arriba — lo decide flipIntoView, que
		     mide contra el visualViewport, no contra la ventana. En celular el
		     lugar lo consigue el teclado bajándose al abrir (ver toggleOpen), no
		     una disposición aparte. -->
		<div
			use:flipIntoView
			role="menu"
			aria-label="Acciones del bloque"
			data-editor-transient
			class="cn-pop bg-popover border-border absolute top-full right-0 z-20 mt-1 max-h-[70dvh] w-56 overflow-y-auto rounded-md border p-1 shadow-md"
		>
			{#if contentActions}
				<button
					type="button"
					role="menuitem"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => run(onAddNote, false)}
					class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
				>
					<StickyNote size={15} aria-hidden="true" />
					<span class="flex-1">Agregar comentario</span>
					<kbd class="text-faint border-border rounded border px-1 text-xs">Ctrl+↵</kbd>
				</button>
			{/if}
			<!-- Todo lo que sigue escribe el renglón, así que el invitado no lo ve. -->
			{#if !noteOnly}
				<button
					type="button"
					role="menuitem"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => run(onMoveUp)}
					class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
				>
					<ArrowUp size={15} aria-hidden="true" />
					<span class="flex-1">Mover arriba</span>
				</button>
				<button
					type="button"
					role="menuitem"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => run(onMoveDown)}
					class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
				>
					<ArrowDown size={15} aria-hidden="true" />
					<span class="flex-1">Mover abajo</span>
				</button>
				{#if contentActions}
					<button
						type="button"
						role="menuitem"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => run(onSaveSnippet)}
						class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
					>
						<BookmarkPlus size={15} aria-hidden="true" />
						<span class="flex-1">Guardar como snippet</span>
					</button>
					<button
						type="button"
						role="menuitem"
						data-tag-picker-trigger
						onmousedown={(event) => event.preventDefault()}
						onclick={() => run(onTag, false)}
						class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
					>
						<Tag size={15} aria-hidden="true" />
						<span class="flex-1">Etiquetar</span>
						<kbd class="text-faint border-border rounded border px-1 text-xs">#</kbd>
					</button>
				{/if}
				<button
					type="button"
					role="menuitem"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => run(onDelete, false)}
				class="cn-touch-row text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
				>
					<Trash2 size={15} aria-hidden="true" />
					<span class="flex-1">Eliminar</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
