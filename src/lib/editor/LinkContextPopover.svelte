<script>
	import { keyboardInset } from '$lib/actions/keyboardInset';

	let { href, focusOnOpen = false, onOpen, onEdit, onClose } = $props();

	let root = $state();
	let openButton = $state();
	let urlEl = $state();

	$effect(() => {
		if (focusOnOpen) openButton?.focus({ preventScroll: true });
	});

	$effect(() => {
		const value = href;
		if (!urlEl) return;
		if (urlEl.value !== value) urlEl.value = value;
		urlEl.style.height = 'auto';
		urlEl.style.height = `${Math.min(urlEl.scrollHeight, 192)}px`;
	});

	$effect(() => {
		if (!root) return;
		function outside(event) {
			if (!root.contains(event.target)) onClose?.(false);
		}
		document.addEventListener('pointerdown', outside, true);
		return () => document.removeEventListener('pointerdown', outside, true);
	});

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose?.(true);
			return;
		}
		if (event.key === 'Tab') {
			const focusable = [urlEl, ...root.querySelectorAll('button:not([disabled])')].filter(Boolean);
			const atBoundary = event.shiftKey
				? document.activeElement === focusable[0]
				: document.activeElement === focusable[focusable.length - 1];
			if (atBoundary) {
				event.preventDefault();
				onClose?.(true);
			}
		}
	}

	function handleFocusout(event) {
		if (event.relatedTarget && !root?.contains(event.relatedTarget)) onClose?.(false);
	}
</script>

<div
	bind:this={root}
	use:keyboardInset
	role="dialog"
	tabindex="-1"
	aria-label="Acciones del enlace"
	data-link-context
	data-editor-transient
	onpointerdown={(event) => event.stopPropagation()}
	onkeydown={handleKeydown}
	onfocusout={handleFocusout}
	class="cn-pop bg-popover border-border text-popover-foreground flex max-h-[calc(var(--visual-viewport-height,100svh)-1rem)] w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 overflow-y-auto overscroll-contain rounded-md border p-1.5 shadow-md"
>
	<textarea
		bind:this={urlEl}
		dir="ltr"
		translate="no"
		title={href}
		aria-label="Dirección del enlace"
		value={href}
		rows="1"
		readonly
		spellcheck="false"
		class="text-muted-foreground focus-visible:ring-ring max-h-[min(12rem,calc(var(--visual-viewport-height,100dvh)-4.5rem))] min-w-0 basis-full resize-none overflow-y-auto overscroll-contain break-words rounded-sm border-0 bg-transparent px-1.5 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none [overflow-wrap:anywhere]"
	></textarea>
	<div class="ml-auto flex items-center gap-1">
		<button
			bind:this={openButton}
			type="button"
			onmousedown={(event) => event.preventDefault()}
			onclick={onOpen}
			class="text-primary hover:bg-accent focus-visible:ring-ring flex min-h-11 items-center rounded-sm px-2.5 text-sm font-bold transition-[background-color,transform] duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
		>
			Abrir
		</button>
		<button
			type="button"
			onmousedown={(event) => event.preventDefault()}
			onclick={onEdit}
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center rounded-sm px-2.5 text-sm transition-[background-color,color,transform] duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
		>
			Editar
		</button>
	</div>
</div>
