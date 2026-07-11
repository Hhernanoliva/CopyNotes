<script>
	import { Bold, Italic, Underline, Strikethrough, Code, Link, Palette, MoreHorizontal } from '@lucide/svelte';
	import FormattingButton from './FormattingButton.svelte';
	import LinkEditorPopover from './LinkEditorPopover.svelte';
	import TextColorPopover from './TextColorPopover.svelte';

	let { rect, active, enabled, currentColor = null, currentLinkUrl = '', onCommand, onClose } = $props();

	let el = $state();
	let openPanel = $state(null); // 'link' | 'color' | 'more' | null

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
		left = Math.min(Math.max(left, margin), window.innerWidth - box.width - margin);
		pos = { top: top + window.scrollY, left: left + window.scrollX };
	});

	$effect(() => {
		function onKey(e) { if (e.key === 'Escape') { openPanel ? (openPanel = null) : onClose(); } }
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const headings = [
		['h1', 'Título 1', active.h1],
		['h2', 'Título 2', active.h2],
		['h3', 'Título 3', active.h3],
		['normal', 'Texto normal', active.normal]
	];
</script>

{#if rect}
	<div
		bind:this={el}
		role="toolbar"
		aria-label="Formato de texto"
		style="position:absolute; top:{pos.top}px; left:{pos.left}px; z-index:50;"
		onmousedown={(e) => e.preventDefault()}
		class="bg-popover border-border flex items-center gap-0.5 rounded-lg border p-1 shadow-xl"
	>
		{#each headings as [id, label, on]}
			<FormattingButton {label} active={on} disabled={!enabled.blockType} onActivate={() => onCommand(id)}>
				<span class="text-xs font-semibold">{id === 'normal' ? '¶' : id.toUpperCase()}</span>
			</FormattingButton>
		{/each}

		<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

		<FormattingButton label="Negrita" shortcut="Ctrl/Cmd+B" active={active.bold} disabled={!enabled.inline} onActivate={() => onCommand('bold')}><Bold size={15} /></FormattingButton>
		<FormattingButton label="Subrayado" shortcut="Ctrl/Cmd+U" active={active.underline} disabled={!enabled.inline} onActivate={() => onCommand('underline')}><Underline size={15} /></FormattingButton>
		<FormattingButton label="Cursiva" shortcut="Ctrl/Cmd+I" active={active.italic} disabled={!enabled.inline} onActivate={() => onCommand('italic')}><Italic size={15} /></FormattingButton>
		<FormattingButton label="Tachado" shortcut="Ctrl/Cmd+Shift+S" active={active.strike} disabled={!enabled.inline} onActivate={() => onCommand('strike')}><Strikethrough size={15} /></FormattingButton>
		<FormattingButton label="Código en línea" active={active.code} disabled={!enabled.inlineCode} onActivate={() => onCommand('code')}><Code size={15} /></FormattingButton>

		<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

		<div class="relative">
			<FormattingButton label="Enlace" shortcut="Ctrl/Cmd+K" active={active.link} disabled={!enabled.link} onActivate={() => (openPanel = openPanel === 'link' ? null : 'link')}><Link size={15} /></FormattingButton>
			{#if openPanel === 'link'}
				<div class="absolute left-0 top-full mt-1">
					<LinkEditorPopover initialUrl={currentLinkUrl}
						onSave={(u) => { onCommand('link', u); openPanel = null; }}
						onRemove={() => { onCommand('removeLink'); openPanel = null; }}
						onClose={() => (openPanel = null)} />
				</div>
			{/if}
		</div>

		<div class="relative">
			<FormattingButton label="Color de texto" active={!!currentColor} disabled={!enabled.color} onActivate={() => (openPanel = openPanel === 'color' ? null : 'color')}><Palette size={15} /></FormattingButton>
			{#if openPanel === 'color'}
				<div class="absolute left-0 top-full mt-1">
					<TextColorPopover current={currentColor}
						onPick={(c) => { onCommand('color', c); openPanel = null; }}
						onClose={() => (openPanel = null)} />
				</div>
			{/if}
		</div>

		<div class="relative">
			<FormattingButton label="Más opciones" onActivate={() => (openPanel = openPanel === 'more' ? null : 'more')}><MoreHorizontal size={15} /></FormattingButton>
			{#if openPanel === 'more'}
				<div class="bg-popover border-border absolute left-0 top-full mt-1 flex flex-col rounded-md border p-1 shadow-lg" role="menu">
					<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('clear'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Quitar formato</button>
					<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('copyText'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Copiar texto seleccionado</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
