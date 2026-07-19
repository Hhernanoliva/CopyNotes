<script module>
	// Shared across every row; an Intl formatter is expensive to build.
	const codeLineFormatter = new Intl.NumberFormat('es');
</script>

<script>
	import { onMount, tick } from 'svelte';
	import { scale } from 'svelte/transition';
	import { ChevronRight, Check, Copy, CopyPlus } from '@lucide/svelte';
	import { MOTION, motionDuration } from '$lib/motion';
	import SlashMenu from './SlashMenu.svelte';
	import DatePanel from './DatePanel.svelte';
	import BlockActionsMenu from './BlockActionsMenu.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { badgeLabel, currentDay, isOverdue } from '$lib/dates';
	import {
		CLIPBOARD_FORMAT,
		deserializeForest,
		normalizeNewlines,
		recallCopy
	} from '$lib/copy/serialize';
	import { sanitizeHtml, htmlToPlainText, applyInline, normalizeForest } from '$lib/format';
	import { planNoteExit } from './note';
	import { textOffset, plainTextOffset, rangeAtPlainOffset } from './selection-offsets';

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
		onToggleCodeCollapsed,
		onToggleChecked,
		onCopy,
		onSaveSnippet,
		onActive,
		selected = false,
		onShiftSelect,
		onPlainMousedown,
		onDragOver,
		onDragHold,
		tags = [],
		allTags = [],
		tagPickerOpen = false,
		onTag,
		onUntag,
		onTagPick,
		onTagPickerClose,
		onSlashKey,
		onSlashSelect,
		focusCaret = null,
		onFocusHandled,
		onVerticalArrow,
		onPasteLines,
		onPasteBlocks,
		onPasteCode,
		onRequestLink,
		datePanelOpen = false,
		onDateBadge,
		onDatePick,
		onDateRemove,
		onDatePanelClose
	} = $props();

	let el = $state();
	let noteEl = $state();
	let codeToggleEl = $state();

	// Quiet Motion (spec 024, Stage 5). `ready` gates entry animations so they
	// never fire on first render — a fresh row (note load / note switch) must
	// appear at rest, not pop. It flips true after mount, so later state
	// changes on a live row do animate.
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	// Copy confirmation: the copy buttons briefly swap their icon to a check.
	// Only ever triggered by a click, so no first-render noise. Optimistic —
	// copy almost never fails, and a failure still raises its own toast.
	let copied = $state(false);
	let copiedWithChildren = $state(false);
	let copyTimer;
	function confirmCopy(withChildren) {
		clearTimeout(copyTimer);
		copied = !withChildren;
		copiedWithChildren = withChildren;
		copyTimer = setTimeout(() => {
			copied = false;
			copiedWithChildren = false;
		}, 1000);
		onCopy(block, withChildren);
	}
	$effect(() => () => clearTimeout(copyTimer));
	// The secondary note editor shows once it has content or the user is adding
	// one via Shift+Enter (editor UX pass, slice B).
	let showNote = $state(false);
	const noteVisible = $derived(showNote || (block.note ?? '') !== '');

	// Headings/text/bullet/todo render sanitized rich HTML; code/separator stay
	// literal plain text (code needs exact whitespace, separator has no content).
	const isRich = $derived(block.type !== 'code' && block.type !== 'separator');
	const codeLines = $derived(
		block.type === 'code' && (block.content ?? '') !== ''
			? normalizeNewlines(block.content).split('\n')
			: []
	);
	const codeLineCount = $derived(codeLines.length);
	const isLongCode = $derived(codeLineCount > 12);
	const codeCollapsed = $derived(isLongCode && (block.codeCollapsed ?? false));
	const codePreview = $derived(codeCollapsed ? codeLines.slice(0, 6).join('\n') : '');

	const today = $derived(currentDay());
	const dueLabel = $derived(block.dueDate ? badgeLabel(block.dueDate, today) : '');
	const overdue = $derived(isOverdue(block, today));

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
		} else if (el.innerText !== (block.content ?? '')) {
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

	// The one definition of this block's focus target: the editable when it is
	// rendered, else the collapsed-code toggle. caretToEnd also parks the caret
	// at the end of the content.
	function focusBlockSurface(caretToEnd = false) {
		if (!el) {
			codeToggleEl?.focus();
			return;
		}
		el.focus();
		if (caretToEnd && block.type !== 'separator') {
			const selection = window.getSelection();
			selection.selectAllChildren(el);
			selection.collapseToEnd();
		}
	}

	function handleNoteKeydown(event) {
		// Double Enter leaves the note: the second Enter lands on an empty line,
		// so the empty line is dropped and a fresh text block opens below.
		if (event.key === 'Enter' && !event.shiftKey) {
			const selection = window.getSelection();
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const start = textOffset(noteEl, range.startContainer, range.startOffset);
				const end = textOffset(noteEl, range.endContainer, range.endOffset);
				const plan = planNoteExit(noteEl.textContent, start, end);
				if (plan) {
					event.preventDefault();
					noteEl.textContent = plan.text;
					onNoteInput(block, plan.text);
					if (plan.text === '') showNote = false;
					onEnter(block, 'text');
					return;
				}
			}
		}
		if (event.key === 'Backspace' && noteEl.textContent === '') {
			event.preventDefault();
			onNoteInput(block, '');
			showNote = false;
			focusBlockSurface();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			focusBlockSurface();
		}
	}

	function handleNoteBlur() {
		// An empty note that loses focus disappears; a filled one stays.
		if (noteEl && noteEl.textContent === '') showNote = false;
	}

	$effect(() => {
		if (!focused) return;
		if (!el && !codeToggleEl) return;
		// focusCaret is a plain-text offset to land on (slash menu returns the
		// caret to where the "/" was); without it, park the caret at the end.
		if (focusCaret != null && el && block.type !== 'separator') {
			el.focus();
			const range = rangeAtPlainOffset(el, focusCaret);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		} else {
			focusBlockSurface(true);
		}
		onFocusHandled();
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
		if (handleSurfaceKeys(event)) return;
		if (event.key === 'Backspace' && (block.type === 'separator' || el.textContent === '')) {
			event.preventDefault();
			onBackspaceEmpty(block);
		}
	}

	// Block-level keys shared by every focusable surface of the row (the
	// editable, the separator, the collapsed-code toggle): Enter makes a new
	// block, Tab indents, bare arrows navigate, Alt+arrows move the block.
	function handleSurfaceKeys(event) {
		if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			onEnter(block);
			return true;
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			if (event.shiftKey) onOutdent(block);
			else onIndent(block);
			return true;
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
			return true;
		}
		if (event.altKey && event.key === 'ArrowUp') {
			event.preventDefault();
			onMoveUp(block);
			return true;
		}
		if (event.altKey && event.key === 'ArrowDown') {
			event.preventDefault();
			onMoveDown(block);
			return true;
		}
		return false;
	}

	// Plain-text offset of the caret inside this block's editable, or null when
	// the selection lives elsewhere. The slash menu anchors "/" with it.
	function caretPlainOffset() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		if (!el || !el.contains(range.startContainer)) return null;
		return plainTextOffset(el, range.startContainer, range.startOffset);
	}

	function handleInput() {
		let consumed = false;
		const caret = caretPlainOffset();
		if (isRich) {
			const html = sanitizeHtml(el.innerHTML);
			consumed = onInput(block, { html, content: htmlToPlainText(html), caret }) === true;
		} else {
			const text = el.innerText;
			consumed = onInput(block, { html: text, content: text, caret }) === true;
		}
		// Typed triggers such as "#" are commands, not content. The block may
		// already be empty in state, so clear the live editable explicitly.
		if (consumed) el.replaceChildren();
	}

	// Paste handling, in priority order:
	// 1. CopyNotes' own copied content (hidden marker in the HTML) → rebuild the
	//    exact blocks, types and nesting included.
	// 2. External text that clearly looks like code → one literal code block.
	// 3. Other multi-line text → split into blocks, recognising bullets/todos.
	// 4. A single line → let the browser paste it inline.
	// Code blocks always insert the raw clipboard text themselves so browser-made
	// line wrappers cannot eat line breaks when the block is read back.
	function insertCodeText(text) {
		const selection = window.getSelection();
		let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		if (!range || !el.contains(range.startContainer) || !el.contains(range.endContainer)) {
			range = document.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
		}
		range.deleteContents();
		const inserted = document.createTextNode(text);
		range.insertNode(inserted);
		range.setStartAfter(inserted);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
		handleInput();
	}

	function handlePaste(event) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (block.type === 'code') {
			if (text === '') return;
			event.preventDefault();
			insertCodeText(text);
			return;
		}
		// Prefer CopyNotes' own content: the custom clipboard format when the
		// browser delivers it, else the localStorage buffer matched by exact text.
		// Any page can write our clipboard format, so the payload goes through
		// the ingest gate: shape repaired, html sanitized (see format/ingest.ts).
		const payload = event.clipboardData?.getData(CLIPBOARD_FORMAT) || recallCopy(text);
		const forest = normalizeForest(deserializeForest(payload));
		if (forest) {
			event.preventDefault();
			onPasteBlocks?.(block, forest);
			return;
		}
		if (!text.includes('\n')) return;
		event.preventDefault();
		if ((block.content ?? '') === '' && onPasteCode?.(block, text)) return;
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
		focusBlockSurface(true);
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
	class="group relative flex flex-wrap items-start gap-1 rounded-md py-0.5 pr-10 md:flex-nowrap md:pr-2 {selected
		? 'bg-primary/10'
		: ''}"
	style="padding-left: {depth * 1.5}rem"
	onpointerenter={(event) => onDragOver?.(block, event.buttons)}
	onpointerdown={(event) => onDragHold?.(block.id, event)}
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
					<span in:scale={{ start: 0.5, duration: ready ? motionDuration(MOTION.fast) : 0 }}>
						<Check size={12} />
					</span>
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
			data-block-surface
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
			{#if codeCollapsed}
				<pre
					id={`code-content-${block.id}`}
					aria-label="Vista previa de código"
					translate="no"
					class="block-editable--code bg-muted min-h-7 w-full min-w-0 overflow-hidden rounded-t-md px-3 py-2 font-mono text-sm leading-6"
				>{codePreview}</pre>
			{:else}
				<div
					bind:this={el}
					id={block.type === 'code' ? `code-content-${block.id}` : undefined}
					contenteditable={isRich ? 'true' : 'plaintext-only'}
					role="textbox"
					tabindex="0"
					data-block-surface
					aria-multiline="true"
					aria-label={ariaLabels[block.type] ?? 'Bloque de texto'}
					aria-haspopup="listbox"
					aria-controls={slashOpen ? 'slash-menu' : undefined}
					aria-activedescendant={slashOpen && slashCommands[slashIndex]
						? `slash-option-${slashCommands[slashIndex].id}`
						: undefined}
					data-placeholder={placeholder}
					spellcheck={block.type === 'code' ? false : undefined}
					autocapitalize={block.type === 'code' ? 'off' : undefined}
					translate={block.type === 'code' ? 'no' : undefined}
					onkeydown={handleKeydown}
					oninput={handleInput}
					onpaste={handlePaste}
					onmousedown={handleMousedown}
					onfocus={() => onActive(block)}
					class="block-editable min-h-7 w-full min-w-0 leading-relaxed break-words whitespace-pre-wrap outline-none {block.type ===
					'code'
						? `block-editable--code bg-muted px-3 py-2 font-mono text-sm leading-6 ${isLongCode ? 'rounded-t-md' : 'rounded-md'}`
						: 'text-base'} {block.type === 'todo' && block.checked
						? 'text-muted-foreground line-through'
						: ''} {block.type === 'heading1' ? 'block-editable--h1' : ''} {block.type === 'heading2'
						? 'block-editable--h2'
						: ''} {block.type === 'heading3' ? 'block-editable--h3' : ''}"
				></div>
			{/if}
			{#if isLongCode}
				<button
					bind:this={codeToggleEl}
					type="button"
					data-block-surface
					onclick={() => onToggleCodeCollapsed(block)}
					onkeydown={handleSurfaceKeys}
					onfocus={() => onActive(block)}
					aria-controls={`code-content-${block.id}`}
					aria-expanded={!codeCollapsed}
					class="bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-b-md border-t px-3 text-xs transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
				>
					<ChevronRight
						size={13}
						aria-hidden="true"
						class="transition-transform duration-(--motion-fast) {codeCollapsed ? '' : 'rotate-90'}"
					/>
					<span>{codeCollapsed ? 'Ver código completo' : 'Contraer código'}</span>
					<span class="ml-auto tabular-nums">{codeLineFormatter.format(codeLineCount)} líneas</span>
				</button>
			{/if}
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

	{#if block.dueDate && block.type !== 'separator'}
		<button
			type="button"
			aria-label="Cambiar fecha"
			use:tooltip={'Cambiar o quitar fecha'}
			onmousedown={(event) => event.preventDefault()}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={() => onDateBadge(block)}
			class="{overdue ? 'text-destructive' : 'text-muted-foreground'} hover:text-foreground focus-visible:ring-ring flex h-7 shrink-0 items-center gap-1 self-center rounded-sm px-1.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
		>📅 {dueLabel}</button>
	{/if}

	{#if tags.length > 0}
		<div
			class="mt-1 flex w-full basis-full flex-wrap items-center gap-1 {block.type === 'todo'
				? 'pl-[3.25rem]'
				: block.type === 'bullet'
					? 'pl-[2.125rem]'
					: 'pl-6'} md:mt-0 md:w-auto md:max-w-[40%] md:basis-auto md:shrink-0 md:self-center md:pl-0"
		>
			<TagChips {tags} onRemove={(tag) => onUntag(block, tag)} />
		</div>
	{/if}

	<!-- Line actions: the copy buttons stay visible (copy-with-children only on
	     parents), everything else lives in the 3-dots menu (editor UX pass).
	     Hidden until hover/keyboard focus so the page stays quiet.
	     mousedown+preventDefault keeps the caret in the block. -->
	<div
		class="pointer-events-none absolute top-0.5 right-1 flex shrink-0 flex-col items-center opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:z-10 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:z-10 group-hover:pointer-events-auto group-hover:opacity-100 md:static md:flex-row md:gap-0.5"
	>
		<button
			type="button"
			aria-label="Copiar bloque"
			use:tooltip={copied ? 'Copiado' : 'Copiar bloque'}
			onmousedown={(event) => event.preventDefault()}
			onclick={() => confirmCopy(false)}
			class="text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			{#if copied}
				<span class="text-primary" in:scale={{ start: 0.5, duration: motionDuration(MOTION.fast) }}>
					<Check size={14} aria-hidden="true" />
				</span>
			{:else}
				<Copy size={14} aria-hidden="true" />
			{/if}
		</button>
		{#if hasChildren}
			<button
				type="button"
				aria-label="Copiar con subniveles"
				use:tooltip={copiedWithChildren ? 'Copiado' : 'Copiar con subniveles'}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => confirmCopy(true)}
				class="text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				{#if copiedWithChildren}
					<span class="text-primary" in:scale={{ start: 0.5, duration: motionDuration(MOTION.fast) }}>
						<Check size={14} aria-hidden="true" />
					</span>
				{:else}
					<CopyPlus size={14} aria-hidden="true" />
				{/if}
			</button>
		{/if}
		{#if block.type !== 'separator'}
			<BlockActionsMenu
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

	{#if datePanelOpen}
		<div class="absolute top-full left-8 z-10 mt-1">
			<DatePanel
				hasDate={!!block.dueDate}
				onPick={(day) => onDatePick(block, day)}
				onRemove={() => onDateRemove(block)}
				onClose={() => onDatePanelClose(block)}
			/>
		</div>
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

	.block-editable--code {
		overflow-x: auto;
		overflow-y: hidden;
		white-space: pre;
		overflow-wrap: normal;
		word-break: normal;
		tab-size: 4;
	}

</style>
