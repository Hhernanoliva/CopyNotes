<script>
	import { Bold, Italic, Underline, Strikethrough, Code, Link, Palette, MoreHorizontal } from '@lucide/svelte';
	import FormattingButton from './FormattingButton.svelte';
	import LinkEditorPopover from './LinkEditorPopover.svelte';
	import TextColorPopover from './TextColorPopover.svelte';
	import { keyboardInset } from '$lib/actions/keyboardInset';
	import { nextToolbarIndex } from './toolbar-keys';

	let {
		rect,
		active,
		enabled,
		currentColor = null,
		currentLinkUrl = '',
		requestPanel = null,
		requestFocus = 0,
		onCommand,
		onRestorePanelFocus = null,
		onClose
	} = $props();

	let el = $state();
	let openPanel = $state(null); // 'link' | 'color' | 'more' | null
	// El botón que abrió el panel, cuando lo abrió el TECLADO. Con el mouse queda
	// null: los botones cancelan el foco en mousedown para no perder la selección
	// del texto, y esa diferencia es justo la que distingue los dos caminos.
	let panelOpener = $state(null);

	function togglePanel(name) {
		const wasOpen = openPanel === name;
		openPanel = wasOpen ? null : name;
		const focused = document.activeElement;
		panelOpener =
			!wasOpen && focused instanceof HTMLButtonElement && el?.contains(focused) ? focused : null;
	}

	// Cerrar un popover con Escape (o su botón cerrar) devuelve el foco a la caja
	// editable manteniendo la barra abierta (spec 020). Si lo abrió el teclado, el
	// foco vuelve al botón que lo abrió, para poder seguir caminando la barra.
	function closePanel() {
		openPanel = null;
		const opener = panelOpener;
		panelOpener = null;
		if (opener) opener.focus();
		else onRestorePanelFocus?.();
	}

	// Ctrl/Cmd+K fired from a block with no toolbar visible: Editor rebuilds the
	// toolbar and tags it with a one-shot requestPanel. Sync that external
	// intent into this component's own panel state once when it arrives.
	// requestPanel is { panel: 'link', seq: <number> } to ensure the effect
	// re-runs even on repeated presses (the seq value changes each time).
	$effect(() => {
		if (requestPanel) openPanel = requestPanel.panel;
	});

	// Ctrl/Cmd+Alt+F desde el renglón (spec 033): el foco entra en el primer botón
	// que se pueda usar. El contador cambia en cada pedido para que el efecto
	// vuelva a correr aunque la barra ya estuviera abierta.
	$effect(() => {
		if (!requestFocus) return;
		buttonsIn(el?.querySelector('[data-cn-toolbar-group="row"]'))[0]?.focus();
	});

	// Abierto con el teclado, el panel se lleva el foco adentro. El de enlace no:
	// ya enfoca solo su casilla de dirección.
	$effect(() => {
		if (!openPanel || !panelOpener || openPanel === 'link') return;
		buttonsIn(el?.querySelector('[data-cn-toolbar-group="panel"]'))[0]?.focus();
	});

	function buttonsIn(group) {
		return group ? Array.from(group.querySelectorAll('button:not([disabled])')) : [];
	}

	// Caminar la barra. Los deshabilitados ni se cuentan, así que saltearlos no
	// necesita lógica. Solo actúa con el foco en un botón: adentro de la casilla
	// de dirección del enlace las flechas tienen que mover el cursor del texto.
	function navigate(event) {
		const focused = document.activeElement;
		if (!(focused instanceof HTMLButtonElement)) return;
		// Tab aplica, igual que Enter, como el menú "/" y el de etiquetas.
		if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			focused.click();
			return;
		}
		const buttons = buttonsIn(focused.closest('[data-cn-toolbar-group]'));
		const next = nextToolbarIndex(buttons.indexOf(focused), buttons.length, event.key, event.shiftKey);
		if (next === null) return;
		event.preventDefault();
		buttons[next].focus();
	}

	// Position above the selection; flip below when there is no room. Runs after
	// layout so the toolbar's own size is known.
	let pos = $state({ top: 0, left: 0 });
	$effect(() => {
		if (!rect || !el) return;
		const box = el.getBoundingClientRect();
		const margin = 8;
		let top = rect.top - box.height - margin;
		if (top < margin) top = rect.bottom + margin;
		let left = rect.left + rect.width / 2 - box.width / 2;
		// Cuando la barra es tan ancha como la pantalla, el borde derecho ideal
		// queda a la izquierda del margen: no dejar el borde izquierdo negativo.
		const maxLeft = Math.max(margin, window.innerWidth - box.width - margin);
		left = Math.min(Math.max(left, margin), maxLeft);
		pos = { top: top + window.scrollY, left: left + window.scrollX };
	});

	$effect(() => {
		function onKey(e) { if (e.key === 'Escape') { openPanel ? closePanel() : onClose(); } }
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const headings = $derived([
		['h1', 'Título 1', active.h1],
		['h2', 'Título 2', active.h2],
		['h3', 'Título 3', active.h3],
		['normal', 'Texto normal', active.normal]
	]);
</script>

{#if rect}
	<div
		bind:this={el}
		use:keyboardInset
		role="toolbar"
		tabindex="0"
		aria-label="Formato de texto"
		data-copynotes-toolbar
		style="position:absolute; top:{pos.top}px; left:{pos.left}px; z-index:50;"
		onmousedown={(e) => e.preventDefault()}
		onkeydown={navigate}
		class="cn-toolbar relative max-w-[calc(100vw-1rem)]"
	>
		<!-- La fila de botones se desliza al costado cuando no entra en la pantalla.
		     Un contenedor con scroll recorta lo que se sale de su caja, así que los
		     paneles NO viven acá adentro: cuelgan del contenedor de afuera. -->
		<div
			data-cn-toolbar-group="row"
			class="bg-popover border-border flex items-center gap-0.5 overflow-x-auto rounded-lg border p-1 shadow-xl"
		>
			{#each headings as [id, label, on]}
				<FormattingButton {label} active={on} disabled={!enabled.blockType} onActivate={() => onCommand(id)}>
					<span class="text-xs font-semibold">{id === 'normal' ? '¶' : id.toUpperCase()}</span>
				</FormattingButton>
			{/each}

			<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

			<FormattingButton label="Negrita" shortcut="Ctrl/Cmd+B" active={active.bold} disabled={!enabled.bold} onActivate={() => onCommand('bold')}><Bold size={15} /></FormattingButton>
			<FormattingButton label="Subrayado" shortcut="Ctrl/Cmd+U" active={active.underline} disabled={!enabled.inline} onActivate={() => onCommand('underline')}><Underline size={15} /></FormattingButton>
			<FormattingButton label="Cursiva" shortcut="Ctrl/Cmd+I" active={active.italic} disabled={!enabled.inline} onActivate={() => onCommand('italic')}><Italic size={15} /></FormattingButton>
			<FormattingButton label="Tachado" shortcut="Ctrl/Cmd+Shift+S" active={active.strike} disabled={!enabled.inline} onActivate={() => onCommand('strike')}><Strikethrough size={15} /></FormattingButton>
			<FormattingButton label="Código en línea" active={active.code} disabled={!enabled.inlineCode} onActivate={() => onCommand('code')}><Code size={15} /></FormattingButton>

			<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

			<FormattingButton label="Enlace" shortcut="Ctrl/Cmd+K" active={active.link} disabled={!enabled.link} onActivate={() => togglePanel('link')}><Link size={15} /></FormattingButton>
			<FormattingButton label="Color de texto" active={!!currentColor} disabled={!enabled.color} onActivate={() => togglePanel('color')}><Palette size={15} /></FormattingButton>
			<FormattingButton label="Más opciones" onActivate={() => togglePanel('more')}><MoreHorizontal size={15} /></FormattingButton>
		</div>

		<!-- Anclados al borde de la barra, no al botón: la fila puede estar
		     desplazada y el panel tiene que quedarse quieto igual. -->
		{#if openPanel === 'link'}
			<div class="cn-pop absolute left-0 top-full mt-1">
				<LinkEditorPopover initialUrl={currentLinkUrl}
					onSave={(u) => { onCommand('link', u); openPanel = null; }}
					onRemove={() => { onCommand('removeLink'); openPanel = null; }}
					onClose={closePanel} />
			</div>
		{:else if openPanel === 'color'}
			<div class="cn-pop absolute left-0 top-full mt-1">
				<TextColorPopover current={currentColor}
					onPick={(c) => { onCommand('color', c); openPanel = null; }}
					onClose={closePanel} />
			</div>
		{:else if openPanel === 'more'}
			<div class="cn-pop bg-popover border-border absolute left-0 top-full mt-1 flex flex-col rounded-md border p-1 shadow-lg" role="menu" tabindex="-1" data-cn-toolbar-group="panel">
				<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('clear'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Quitar formato</button>
				<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('copyText'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Copiar texto seleccionado</button>
			</div>
		{/if}
	</div>
{/if}
