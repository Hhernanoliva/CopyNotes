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

	// The 3-dots menu holding every block action except the always-visible copy
	// buttons (editor UX pass). Each item shows its typed quick key when it has
	// one. onDismiss returns focus to the block when the menu closes without
	// handing focus to another surface (Escape, click-away, snippet).
	let { onAddNote, onMoveUp, onMoveDown, onDelete, onSaveSnippet, onTag, onDismiss } = $props();

	let open = $state(false);
	let openUp = $state(false);
	let rootEl = $state();

	// Abrir hacia arriba cuando no entra abajo (fila cerca del borde inferior o
	// teclado en pantalla tapando la mitad de abajo). Así el último ítem
	// ("Eliminar") nunca queda cortado. Se decide justo antes de abrir.
	function toggleOpen() {
		if (!open && rootEl) {
			const rect = rootEl.getBoundingClientRect();
			const visibleBottom = window.visualViewport?.height ?? window.innerHeight;
			const estimatedMenuHeight = 280; // ~6 ítems + separación
			openUp = rect.bottom + estimatedMenuHeight > visibleBottom;
		}
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
			: ''}"
	>
		<MoreHorizontal size={14} aria-hidden="true" />
	</button>

	{#if open}
		<div
			role="menu"
			aria-label="Acciones del bloque"
			class="cn-pop bg-popover border-border absolute right-0 z-20 max-h-[70dvh] w-56 overflow-y-auto rounded-md border p-1 shadow-md {openUp
				? 'bottom-full mb-1'
				: 'top-full mt-1'}"
		>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onAddNote, false)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
			>
				<StickyNote size={15} aria-hidden="true" />
				<span class="flex-1">Agregar nota</span>
				<kbd class="text-faint border-border rounded border px-1 text-xs">Ctrl+↵</kbd>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onMoveUp)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
			>
				<ArrowUp size={15} aria-hidden="true" />
				<span class="flex-1">Mover arriba</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onMoveDown)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
			>
				<ArrowDown size={15} aria-hidden="true" />
				<span class="flex-1">Mover abajo</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onSaveSnippet)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
			>
				<BookmarkPlus size={15} aria-hidden="true" />
				<span class="flex-1">Guardar como snippet</span>
			</button>
			<button
				type="button"
				role="menuitem"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => run(onTag, false)}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
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
				class="text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none"
			>
				<Trash2 size={15} aria-hidden="true" />
				<span class="flex-1">Eliminar</span>
			</button>
		</div>
	{/if}
</div>
