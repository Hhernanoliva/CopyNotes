<script>
	import { tick } from 'svelte';
	import { ChevronRight, Check, Copy } from '@lucide/svelte';
	import SlashMenu from './SlashMenu.svelte';
	import BlockActionsMenu from './BlockActionsMenu.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { CLIPBOARD_FORMAT, deserializeForest, recallCopy } from '$lib/copy/serialize';
	import { sanitizeHtml, htmlToPlainText, applyInline } from '$lib/format';

	let {
		block,
		depth = 0,
		hasChildren = false,
		focused = false,
		placeholder = '',
		slashOpen = false,
		slashCommands = [],
		slashIndex = 0,
		slashEmptyLabel = 'Sin resultados',
		onInput,
		onNoteInput,
		onEnter,
		onBackspaceEmpty,
		onIndent,
		onOutdent,
		onMoveUp,
		onMoveDown,
		onToggleCollapsed,
		onToggleChecked,
		onCopy,
		onSaveSnippet,
		onActive,
		selected = false,
		onShiftSelect,
		onPlainMousedown,
		onDragOver,
		tags = [],
		allTags = [],
		tagPickerOpen = false,
		onTag,
		onUntag,
		onTagPick,
		onTagPickerClose,
		onSlashKey,
		onSlashSelect,
		onFocusHandled,
		onVerticalArrow,
		onPasteLines,
		onPasteBlocks,
		onRequestLink
	} = $props();

	let el = $state();
	let noteEl = $state();
	// The secondary note editor shows once it has content or the user is adding
	// one via Shift+Enter (editor UX pass, slice B).
	let showNote = $state(false);
	const noteVisible = $derived(showNote || (block.note ?? '') !== '');

	// Headings/text/bullet/todo render sanitized rich HTML; code/separator stay
	// literal plain text (code needs exact whitespace, separator has no content).
	const isRich = $derived(block.type !== 'code' && block.type !== 'separator');

	// Sync DOM only when state and DOM diverge (e.g. slash command strips the
	// "/query" text). While the user types they always match, so the caret is
	// never clobbered.
	$effect(() => {
		if (!el || block.type === 'separator') return;
		if (isRich) {
			const html = block.html ?? '';
			if (html !== '') {
				const safe = sanitizeHtml(html);
				if (el.innerHTML !== safe) el.innerHTML = safe;
			} else if (el.textContent !== (block.content ?? '')) {
				el.textContent = block.content ?? '';
			}
		} else if (el.textContent !== block.content) {
			el.textContent = block.content;
		}
	});

	$effect(() => {
		if (noteEl && noteEl.textContent !== (block.note ?? '')) {
			noteEl.textContent = block.note ?? '';
		}
	});

	async function openNote() {
		showNote = true;
		await tick();
		if (noteEl) {
			noteEl.focus();
			const selection = window.getSelection();
			selection.selectAllChildren(noteEl);
			selection.collapseToEnd();
		}
	}

	function handleNoteInput() {
		onNoteInput(block, noteEl.textContent);
	}

	function handleNoteKeydown(event) {
		if (event.key === 'Backspace' && noteEl.textContent === '') {
			event.preventDefault();
			onNoteInput(block, '');
			showNote = false;
			el.focus();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			el.focus();
		}
	}

	function handleNoteBlur() {
		// An empty note that loses focus disappears; a filled one stays.
		if (noteEl && noteEl.textContent === '') showNote = false;
	}

	$effect(() => {
		if (focused && el) {
			el.focus();
			if (block.type !== 'separator') {
				const selection = window.getSelection();
				selection.selectAllChildren(el);
				selection.collapseToEnd();
			}
			onFocusHandled();
		}
	});

	function handleKeydown(event) {
		if (slashOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
			event.preventDefault();
			onSlashKey(event.key === 'Tab' ? 'Escape' : event.key);
			return;
		}
		// Inline formatting shortcuts work even when the floating toolbar is not
		// visible; only b/i/u/shift+s/k are claimed, everything else (copy,
		// paste, select-all, undo, Ctrl/Cmd+Enter…) falls through untouched.
		if (isRich && (event.metaKey || event.ctrlKey)) {
			const key = event.key.toLowerCase();
			let cmd = null;
			if (key === 'b') cmd = 'bold';
			else if (key === 'i') cmd = 'italic';
			else if (key === 'u') cmd = 'underline';
			else if (key === 's' && event.shiftKey) cmd = 'strikethrough';
			if (cmd) {
				event.preventDefault();
				applyInline(cmd);
				handleInput();
				return;
			}
			if (key === 'k') {
				event.preventDefault();
				onRequestLink?.(block);
				return;
			}
		}
		// Ctrl/Cmd+Enter adds/edits the gray note (Workflowy-style).
		if (
			event.key === 'Enter' &&
			(event.metaKey || event.ctrlKey) &&
			block.type !== 'code' &&
			block.type !== 'separator'
		) {
			event.preventDefault();
			openNote();
			return;
		}
		// Shift+Enter inserts a soft line break inside this block, not a new one.
		// Code blocks already treat Enter/Shift+Enter as newlines via the browser.
		if (event.key === 'Enter' && event.shiftKey && block.type !== 'separator' && block.type !== 'code') {
			event.preventDefault();
			document.execCommand('insertLineBreak');
			handleInput();
			return;
		}
		if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			onEnter(block);
			return;
		}
		// Bare Up/Down cross to the neighbour block when the caret is at this
		// block's visual edge (Editor decides); otherwise the browser moves the
		// caret inside a wrapped block as usual.
		if (
			(event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
			!event.shiftKey &&
			!event.altKey &&
			!event.metaKey &&
			!event.ctrlKey
		) {
			const direction = event.key === 'ArrowDown' ? 1 : -1;
			if (onVerticalArrow?.(block, direction)) event.preventDefault();
			return;
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			if (event.shiftKey) onOutdent(block);
			else onIndent(block);
			return;
		}
		if (event.altKey && event.key === 'ArrowUp') {
			event.preventDefault();
			onMoveUp(block);
			return;
		}
		if (event.altKey && event.key === 'ArrowDown') {
			event.preventDefault();
			onMoveDown(block);
			return;
		}
		if (event.key === 'Backspace' && (block.type === 'separator' || el.textContent === '')) {
			event.preventDefault();
			onBackspaceEmpty(block);
		}
	}

	function handleInput() {
		if (isRich) {
			const html = sanitizeHtml(el.innerHTML);
			onInput(block, { html, content: htmlToPlainText(html) });
		} else {
			onInput(block, { html: el.textContent, content: el.textContent });
		}
	}

	// Paste handling, in priority order:
	// 1. CopyNotes' own copied content (hidden marker in the HTML) → rebuild the
	//    exact blocks, types and nesting included.
	// 2. External multi-line text → split into blocks, recognising bullets/todos.
	// 3. A single line → let the browser paste it inline.
	// Code blocks keep the browser's literal paste in every case.
	function handlePaste(event) {
		if (block.type === 'code') return;
		const text = event.clipboardData?.getData('text/plain') ?? '';
		// Prefer CopyNotes' own content: the custom clipboard format when the
		// browser delivers it, else the localStorage buffer matched by exact text.
		const payload = event.clipboardData?.getData(CLIPBOARD_FORMAT) || recallCopy(text);
		const forest = deserializeForest(payload);
		if (forest) {
			event.preventDefault();
			onPasteBlocks?.(block, forest);
			return;
		}
		if (!text.includes('\n')) return;
		event.preventDefault();
		onPasteLines?.(block, text);
	}

	// Shift+click selects a block range instead of moving the caret; a plain
	// mousedown starts a potential drag-select and clears any active selection.
	function handleMousedown(event) {
		if (event.shiftKey) {
			event.preventDefault();
			onShiftSelect?.(block);
		} else {
			onPlainMousedown?.(block);
		}
	}

	// Return the caret to this block after a transient menu closes.
	function focusContent() {
		if (!el) return;
		el.focus();
		if (block.type !== 'separator') {
			const selection = window.getSelection();
			selection.selectAllChildren(el);
			selection.collapseToEnd();
		}
	}

	const ariaLabels = {
		text: 'Bloque de texto',
		bullet: 'Viñeta',
		todo: 'Tarea',
		code: 'Bloque de código',
		separator: 'Separador'
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-block-id={block.id}
	class="group relative flex items-start gap-1 rounded-md py-0.5 pr-2 {selected
		? 'bg-primary/10'
		: ''}"
	style="padding-left: {depth * 1.5}rem"
	onpointerenter={(event) => onDragOver?.(block, event.buttons)}
>
	<div class="flex h-7 w-5 shrink-0 items-center justify-center">
		{#if hasChildren}
			<button
				type="button"
				onclick={() => onToggleCollapsed(block)}
				aria-label={block.collapsed ? 'Expandir bloque' : 'Colapsar bloque'}
				aria-expanded={!block.collapsed}
				class="text-faint hover:text-foreground focus-visible:ring-ring flex size-5 items-center justify-center rounded-sm transition-opacity duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {block.collapsed
					? 'opacity-100'
					: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}"
			>
				<ChevronRight
					size={14}
					aria-hidden="true"
					class="transition-transform duration-(--motion-fast) {block.collapsed ? '' : 'rotate-90'}"
				/>
			</button>
		{/if}
	</div>

	{#if block.type === 'bullet'}
		<span aria-hidden="true" class="text-faint mt-[0.65rem] shrink-0 select-none text-[0.6rem] leading-none"
			>●</span
		>
	{:else if block.type === 'todo'}
		<!-- Padded wrapper widens the tap target beyond the visible 16px box. -->
		<button
			type="button"
			role="checkbox"
			aria-checked={block.checked}
			aria-label={block.checked ? 'Desmarcar tarea' : 'Marcar tarea'}
			onclick={() => onToggleChecked(block)}
			class="focus-visible:ring-ring mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<span
				aria-hidden="true"
				class="border-border flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--motion-fast) {block.checked
					? 'bg-primary border-primary text-primary-foreground'
					: 'bg-transparent'}"
			>
				{#if block.checked}
					<Check size={12} />
				{/if}
			</span>
		</button>
	{/if}

	{#if block.type === 'separator'}
		<!-- Focusable on purpose: keyboard users select it to delete it or add a block after. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={el}
			role="separator"
			tabindex="0"
			aria-label="Separador"
			onkeydown={handleKeydown}
			onmousedown={handleMousedown}
			onfocus={() => onActive(block)}
			class="focus-visible:ring-ring flex h-7 w-full items-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<hr class="border-border w-full" />
		</div>
	{:else}
		<div class="flex min-w-0 flex-1 flex-col">
			<div
				bind:this={el}
				contenteditable={isRich ? 'true' : 'plaintext-only'}
				role="textbox"
				tabindex="0"
				aria-multiline="true"
				aria-label={ariaLabels[block.type] ?? 'Bloque de texto'}
				aria-haspopup="listbox"
				aria-controls={slashOpen ? 'slash-menu' : undefined}
				aria-activedescendant={slashOpen && slashCommands[slashIndex]
					? `slash-option-${slashCommands[slashIndex].id}`
					: undefined}
				data-placeholder={placeholder}
				onkeydown={handleKeydown}
				oninput={handleInput}
				onpaste={handlePaste}
				onmousedown={handleMousedown}
				onfocus={() => onActive(block)}
				class="block-editable min-h-7 w-full min-w-0 leading-relaxed break-words whitespace-pre-wrap outline-none {block.type ===
				'code'
					? 'bg-muted rounded-md px-3 py-1 font-mono text-sm whitespace-pre-wrap'
					: 'text-base'} {block.type === 'todo' && block.checked
					? 'text-muted-foreground line-through'
					: ''} {block.type === 'heading1' ? 'block-editable--h1' : ''} {block.type === 'heading2'
					? 'block-editable--h2'
					: ''} {block.type === 'heading3' ? 'block-editable--h3' : ''}"
			></div>
			{#if noteVisible}
				<div
					bind:this={noteEl}
					contenteditable="plaintext-only"
					role="textbox"
					tabindex="0"
					aria-multiline="true"
					aria-label="Nota del bloque"
					data-placeholder="Nota…"
					onkeydown={handleNoteKeydown}
					oninput={handleNoteInput}
					onblur={handleNoteBlur}
					class="block-editable text-muted-foreground mt-0.5 w-full min-w-0 text-sm leading-relaxed break-words whitespace-pre-wrap outline-none"
				></div>
			{/if}
		</div>
	{/if}

	{#if tags.length > 0}
		<div class="flex max-w-[40%] shrink-0 flex-wrap items-center gap-1 self-center">
			<TagChips {tags} onRemove={(tag) => onUntag(block, tag)} />
		</div>
	{/if}

	<!-- Line actions: Copy stays visible, everything else lives in the 3-dots
	     menu (editor UX pass). Hidden until hover/keyboard focus so the page
	     stays quiet. mousedown+preventDefault keeps the caret in the block. -->
	<div
		class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100"
	>
		<button
			type="button"
			aria-label="Copiar bloque"
			use:tooltip={'Copiar bloque'}
			onmousedown={(event) => event.preventDefault()}
			onclick={() => onCopy(block, false)}
			class="text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<Copy size={14} aria-hidden="true" />
		</button>
		{#if block.type !== 'separator'}
			<BlockActionsMenu
				{hasChildren}
				onCopyWithChildren={() => onCopy(block, true)}
				onSaveSnippet={() => onSaveSnippet(block)}
				onTag={() => onTag(block)}
				onDismiss={focusContent}
			/>
		{/if}
	</div>

	{#if slashOpen}
		<SlashMenu
			commands={slashCommands}
			selectedIndex={slashIndex}
			onSelect={onSlashSelect}
			emptyLabel={slashEmptyLabel}
		/>
	{/if}

	{#if tagPickerOpen}
		<TagPicker
			tags={allTags}
			assignedIds={tags.map((tag) => tag.id)}
			onPick={onTagPick}
			onClose={onTagPickerClose}
			align="right"
		/>
	{/if}
</div>

<style>
	.block-editable:empty::before {
		content: attr(data-placeholder);
		color: var(--text-faint);
		pointer-events: none;
	}
</style>
