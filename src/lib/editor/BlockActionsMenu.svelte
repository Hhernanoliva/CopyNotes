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
	let { onAddNote, onMoveUp, onMoveDown, onDelete, onSaveSnippet, onTag, onDismiss, pulseMenu = false } = $props();

	let open = $state(false);
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
		open = !open;
	}

	$effect(() => {
		if (!open) return;
		function onPointerDown(event) {
			if (rootEl && !rootEl.contains(event.target)) {
				open = false;
				onDismiss?.();
			}
		}
		function onKeydown(event) {
			if (event.key === 'Escape') {
				open = false;
				onDismiss?.();
			}
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeydown);
		};
	});

	// restoreFocus false for actions that open another surface (tag picker).
	function run(action, restoreFocus = true) {
		open = false;
		action();
		if (restoreFocus) onDismiss?.();
	}
</script>

{#if open}
	<!-- Sólo en celular, donde el menú es una hoja modal. Va fuera del contenedor
	     del menú a propósito: cerrar mira si el toque cayó fuera de `rootEl`, y un
	     velo adentro no cerraría nada. Además evita que ese toque le caiga al
	     texto de atrás y mueva el cursor. -->
	<div aria-hidden="true" class="fixed inset-0 z-20 bg-black/40 md:hidden"></div>
{/if}

<div bind:this={rootEl} class="relative">
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
		<!-- ponytail: los avisos flotantes (Toaster, bottom-center) caen sobre la
		     hoja y tapan el último ítem, "Eliminar", mientras duran (1,8s). No borra
		     nada por accidente —el toque le pega al aviso, no al botón—, pero no se
		     puede elegir. Mismo choque ya anotado en SlashMenu. Si molesta en uso
		     real, la salida es mover los avisos arriba en celular, no subir el z de
		     la hoja: eso taparía avisos que sí importan.
		     Dos disposiciones, un solo componente (mismo criterio que SlashMenu).
		     Escritorio: cuelga del renglón, y se da vuelta si no entra abajo pero
		     sí arriba — lo decide flipIntoView midiendo el visualViewport, no la
		     ventana. Celular (max-md): hoja fija al pie, de borde a borde; ahí
		     flipIntoView se apaga sola porque un elemento fijo no tiene ancla. -->
		<div
			use:flipIntoView
			role="menu"
			aria-label="Acciones del bloque"
			class="cn-pop bg-popover border-border absolute top-full right-0 z-20 mt-1 max-h-[70dvh] w-56 overflow-y-auto rounded-md border p-1 shadow-md max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:z-30 max-md:mt-0 max-md:max-h-none max-md:w-full max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:p-2 max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
		>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onAddNote, false)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<StickyNote size={15} aria-hidden="true" />
				<span class="flex-1">Agregar comentario</span>
				<kbd class="text-faint border-border rounded border px-1 text-xs">Ctrl+↵</kbd>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onMoveUp)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<ArrowUp size={15} aria-hidden="true" />
				<span class="flex-1">Mover arriba</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onMoveDown)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<ArrowDown size={15} aria-hidden="true" />
				<span class="flex-1">Mover abajo</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onSaveSnippet)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<BookmarkPlus size={15} aria-hidden="true" />
				<span class="flex-1">Guardar como snippet</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onTag, false)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<Tag size={15} aria-hidden="true" />
				<span class="flex-1">Etiquetar</span>
				<kbd class="text-faint border-border rounded border px-1 text-xs">#</kbd>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onDelete, false)}
				class="text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
			>
				<Trash2 size={15} aria-hidden="true" />
				<span class="flex-1">Eliminar</span>
			</button>
		</div>
	{/if}
</div>
