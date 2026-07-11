<script>
	import {
		applyInsertionPlan,
		assignTag,
		createBlock,
		createId,
		createSnippet,
		findOrCreateTag,
		getNote,
		listBlocksByNote,
		listSnippets,
		listTags,
		listTagsForMany,
		putBlock,
		softDeleteBlock,
		softDeleteBlocks,
		unassignTag,
		updateBlock,
		updateNote
	} from '$lib/storage';
	import {
		selectionRange,
		neighborVisibleId,
		orderedSelectionRoots,
		planDeleteSelection,
		planMoveSelection
	} from '$lib/blocks/selection';
	import { filterSnippets, planSnippetInsertion, snippetFieldsFromBlocks } from '$lib/snippets';
	import { detectTrigger } from './triggers';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { Tag } from '@lucide/svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { buildVisibleList } from '$lib/blocks/hierarchy';
	import { planIndent, planOutdent } from '$lib/blocks/indent';
	import { planMoveDown, planMoveUp } from '$lib/blocks/reorder';
	import {
		backspaceAction,
		canDeleteOnBackspace,
		enterOnEmptyAction,
		planEnter,
		previousVisibleId
	} from '$lib/blocks/enter';
	import { planToggleChecked } from '$lib/blocks/cascade';
	import { buildCopyTree, formatPlainText, formatHtml } from '$lib/copy/format';
	import { writeToClipboard } from '$lib/copy/clipboard';
	import { toast } from 'svelte-sonner';
	import { filterCommands, moveSelection } from './slash';
	import { caretColumnX, placeCaretAtColumn, edgeForDirection } from './caret';
	import { parsePastedLines } from './paste';
	import { createHistory, diffBlocks } from './history';
	import BlockRow from './BlockRow.svelte';

	let { noteId, onNoteUpdated, onSaveStateChange, onSnippetsChanged, onTagsChanged } = $props();

	let note = $state(null);
	let blocks = $state([]);
	let focusBlockId = $state(null);
	// Last block the user touched; snippet insertion from the sidebar lands here.
	let activeBlockId = $state(null);
	let titleEl = $state();
	// Slash menu state: which block it is anchored to, the text typed after
	// "/", and the highlighted option. mode 'snippets' means /snippet was
	// chosen and the menu now lists saved snippets instead of block types.
	let slash = $state(null);
	// Tag state: all live tags (for the picker), the note's tags, tags per
	// block id, and which target has the picker open ('note' or a block id).
	let allTags = $state([]);
	let noteTags = $state([]);
	let blockTagsMap = $state({});
	let tagPickerFor = $state(null);
	// Multi-block selection: anchor+focus block ids. selectedIds is the visible
	// range between them; a real selection is 2+ blocks.
	let selection = $state(null);
	// Drag-select: the block where the mouse went down, and whether a drag has
	// actually crossed into another block (so a plain click stays a click).
	let dragAnchorId = $state(null);
	let dragging = $state(false);
	const selectedIds = $derived(
		selection ? selectionRange(blocks, selection.anchorId, selection.focusId) : []
	);
	const hasSelection = $derived(selectedIds.length > 1);
	const selectedSet = $derived(new Set(hasSelection ? selectedIds : []));
	// The block highlight is visual only; announce the count for screen readers.
	const selectionAnnouncement = $derived(
		hasSelection ? `${selectedIds.length} renglones seleccionados` : ''
	);

	const visible = $derived(buildVisibleList(blocks));
	const slashCommands = $derived.by(() => {
		if (!slash) return [];
		if (slash.mode === 'snippets') {
			return filterSnippets(slash.snippets, slash.query).map((snippet) => ({
				id: snippet.id,
				label: snippet.name,
				kind: 'snippet',
				isFavorite: snippet.isFavorite,
				snippet
			}));
		}
		return filterCommands(slash.query);
	});

	// Debounced writes per entity; flushed on unmount so nothing is lost
	// when the user switches notes quickly.
	const pending = new Map();

	function scheduleSave(key, save) {
		onSaveStateChange('saving');
		const existing = pending.get(key);
		if (existing) clearTimeout(existing.timer);
		const entry = {
			save,
			timer: setTimeout(async () => {
				pending.delete(key);
				await save();
				if (pending.size === 0) onSaveStateChange('saved');
			}, 500)
		};
		pending.set(key, entry);
	}

	function flushPending() {
		for (const [key, entry] of pending) {
			clearTimeout(entry.timer);
			entry.save();
			pending.delete(key);
		}
	}

	$effect(() => () => flushPending());

	$effect(() => {
		const id = noteId;
		let cancelled = false;
		(async () => {
			const [loadedNote, loadedBlocks] = await Promise.all([getNote(id), listBlocksByNote(id)]);
			if (cancelled) return;
			note = loadedNote;
			blocks = loadedBlocks;
			activeBlockId = null;
			history.reset();
			lastTextBlockId = null;
			await refreshTags();
			if (note && note.title === '' && titleEl) {
				titleEl.focus();
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// --- Undo/redo (spec 019, fix 6) ---
	// Per-note snapshot history. A snapshot is the full ordered block list plus
	// the focused block. Text edits are grouped into one step per burst.
	const history = createHistory({ limit: 100 });
	let lastTextAt = 0;
	let lastTextBlockId = null;

	function currentSnapshot() {
		return { blocks: $state.snapshot(blocks), focusId: activeBlockId };
	}

	// Record before a structural mutation. Resets the text-burst tracker so a
	// following keystroke starts its own undo step.
	function recordSnapshot() {
		history.push(currentSnapshot());
		lastTextBlockId = null;
	}

	// Record before a text edit, but only once per burst: a new block or a pause
	// over ~600ms starts a fresh undo step.
	function recordTextSnapshot(blockId) {
		const stamp = Date.now();
		if (blockId !== lastTextBlockId || stamp - lastTextAt > 600) history.push(currentSnapshot());
		lastTextAt = stamp;
		lastTextBlockId = blockId;
	}

	// Apply a snapshot to the editor and persist the difference through storage.
	async function restore(snapshot) {
		if (!snapshot) return;
		flushPending();
		const diff = diffBlocks($state.snapshot(blocks), snapshot.blocks);
		for (const id of diff.deletedIds) await softDeleteBlock(id);
		for (const row of diff.created) await putBlock(row);
		for (const row of diff.updated) await putBlock(row);
		blocks = snapshot.blocks.map((row) => ({ ...row }));
		lastTextBlockId = null;
		focusBlockId =
			snapshot.focusId && blocks.some((row) => row.id === snapshot.focusId)
				? snapshot.focusId
				: (blocks[0]?.id ?? null);
	}

	// Structure changes (indent, reorder, collapse…) persist immediately:
	// losing hierarchy is worse than an extra write.
	async function applyUpdates(updates) {
		for (const update of updates) {
			const { id, ...changes } = update;
			const row = blocks.find((block) => block.id === id);
			if (row) Object.assign(row, changes);
			await updateBlock(id, changes);
		}
	}

	function handleTitleInput(event) {
		const title = event.currentTarget.value;
		note.title = title;
		scheduleSave(`title:${note.id}`, async () => {
			await updateNote(note.id, { title });
			onNoteUpdated(note.id, { title });
		});
	}

	function handleTitleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length > 0) focusBlockId = visible[0].block.id;
		}
	}

	function handleBlockInput(block, text) {
		recordTextSnapshot(block.id);
		// Typing "/" in an empty block opens the slash menu; the query is
		// whatever follows. Code blocks are exempt, slashes are normal there.
		if (block.type !== 'code' && text.startsWith('/')) {
			// Keep the snippet-picker mode alive while the user narrows the query.
			if (slash && slash.blockId === block.id && slash.mode === 'snippets') {
				slash.query = text.slice(1);
				slash.index = 0;
			} else {
				slash = { blockId: block.id, query: text.slice(1), index: 0, mode: 'commands' };
			}
		} else if (slash && slash.blockId === block.id) {
			slash = null;
		}
		// Typed triggers: "- "/"* " make a bullet, a lone "#" opens the tag picker.
		const trigger = detectTrigger(block, text);
		if (trigger?.kind === 'bullet') {
			// Structural change: persist immediately — a debounced save under the
			// same key would be replaced by the next keystroke's content-only save.
			block.type = 'bullet';
			block.content = trigger.content;
			updateBlock(block.id, { type: 'bullet', content: trigger.content });
			return;
		}
		if (trigger?.kind === 'tag') {
			// Drop the "#" and open the tag picker anchored to this block.
			block.content = '';
			updateBlock(block.id, { content: '' });
			tagPickerFor = { type: 'block', id: block.id };
			return;
		}
		block.content = text;
		scheduleSave(`block:${block.id}`, () => updateBlock(block.id, { content: text }));
	}

	function handleNoteInput(block, text) {
		recordTextSnapshot(`note:${block.id}`);
		block.note = text;
		scheduleSave(`note:${block.id}`, () => updateBlock(block.id, { note: text }));
	}

	// A new block keeps list-like types going; code and separators hand
	// over to plain text.
	function inheritType(type) {
		return type === 'bullet' || type === 'todo' ? type : 'text';
	}

	async function handleEnter(block, forcedType) {
		if (!forcedType && block.content === '') {
			const action = enterOnEmptyAction(block);
			if (action === 'outdent') {
				await handleOutdent(block);
				return;
			}
			if (action === 'convert') {
				recordSnapshot();
				block.type = 'text';
				block.checked = false;
				await updateBlock(block.id, { type: 'text', checked: false });
				focusBlockId = block.id;
				return;
			}
		}
		const plan = planEnter(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		const created = await createBlock({
			noteId: note.id,
			parentBlockId: plan.parentBlockId,
			type: forcedType ?? inheritType(block.type),
			order: plan.order
		});
		blocks = [...blocks, created];
		focusBlockId = created.id;
	}

	// Paste of multiple lines: split into blocks. Reuse the current block for
	// the first line when it is empty (typical: Enter then paste); otherwise
	// insert every line as a sibling after it. Bullets/todos come pre-typed from
	// the parser; blank lines were already dropped.
	async function handlePasteLines(block, text) {
		const parsed = parsePastedLines(text);
		if (parsed.length === 0) return;
		recordSnapshot();
		let startIndex = 0;
		let afterId = block.id;
		const isEmpty = (block.content ?? '') === '' && block.type !== 'separator';
		if (isEmpty) {
			const first = parsed[0];
			block.type = first.type;
			block.content = first.content;
			const changes = { type: first.type, content: first.content };
			if (first.type === 'todo') {
				block.checked = first.checked;
				changes.checked = first.checked;
			}
			await updateBlock(block.id, changes);
			startIndex = 1;
		}
		for (let i = startIndex; i < parsed.length; i++) {
			const line = parsed[i];
			const plan = planEnter(blocks, afterId);
			if (!plan) break;
			await applyUpdates(plan.updates);
			const created = await createBlock({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				type: line.type,
				order: plan.order,
				content: line.content,
				...(line.type === 'todo' ? { checked: line.checked } : {})
			});
			blocks = [...blocks, created];
			afterId = created.id;
		}
		focusBlockId = afterId;
	}

	async function handleBackspaceEmpty(block) {
		if (backspaceAction(block) === 'convert') {
			recordSnapshot();
			block.type = 'text';
			block.checked = false;
			await updateBlock(block.id, { type: 'text', checked: false });
			focusBlockId = block.id;
			return;
		}
		if (!canDeleteOnBackspace(blocks, block.id)) return;
		recordSnapshot();
		const prevId = previousVisibleId(blocks, block.id);
		await softDeleteBlock(block.id);
		blocks = blocks.filter((row) => row.id !== block.id);
		if (prevId) focusBlockId = prevId;
	}

	async function handleIndent(block) {
		const plan = planIndent(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		// Expand the new parent so the indented block does not vanish.
		const parentId = plan.updates[0].parentBlockId;
		const parent = blocks.find((row) => row.id === parentId);
		if (parent && parent.collapsed) {
			parent.collapsed = false;
			await updateBlock(parent.id, { collapsed: false });
		}
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleOutdent(block) {
		const plan = planOutdent(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveUp(block) {
		const plan = planMoveUp(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveDown(block) {
		const plan = planMoveDown(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleToggleCollapsed(block) {
		recordSnapshot();
		block.collapsed = !block.collapsed;
		await updateBlock(block.id, { collapsed: block.collapsed });
	}

	async function handleCopy(block, withChildren) {
		const tree = buildCopyTree(blocks, block.id, withChildren);
		try {
			await writeToClipboard({ text: formatPlainText(tree), html: formatHtml(tree) });
			toast.success('Copiado');
		} catch {
			toast.error('No se pudo copiar. Probá de nuevo.');
		}
	}

	async function handleToggleChecked(block) {
		const plan = planToggleChecked(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
	}

	// --- Multi-block selection ---

	function shiftSelect(block) {
		const anchor = selection?.anchorId ?? activeBlockId ?? block.id;
		selection = { anchorId: anchor, focusId: block.id };
	}

	function clearSelection() {
		selection = null;
	}

	// A plain mousedown clears any selection and arms a drag from this block.
	function startDrag(block) {
		clearSelection();
		dragAnchorId = block.id;
		dragging = false;
	}

	// Mouse dragged into another block with the button held: grow the block
	// selection to cover the range, and drop the native text selection.
	function dragOver(block, buttons) {
		if (!dragAnchorId || !(buttons & 1) || block.id === dragAnchorId) return;
		dragging = true;
		selection = { anchorId: dragAnchorId, focusId: block.id };
		window.getSelection()?.removeAllRanges();
	}

	function endDrag() {
		dragAnchorId = null;
		dragging = false;
	}

	// Reset the drag on any mouse release, even outside the editor.
	$effect(() => {
		window.addEventListener('pointerup', endDrag);
		return () => window.removeEventListener('pointerup', endDrag);
	});

	// True when the caret sits on the block's first (up) or last (down) visual
	// line, so a further Shift+Arrow should jump to the neighbour block instead
	// of selecting more text inside the current one. Handles wrapped lines via
	// the caret's client rect, not the raw content.
	function caretAtBlockEdge(direction) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return true;
		const range = sel.getRangeAt(0);
		if (!range.collapsed) return false; // mid text-selection: let the browser extend it
		const el = document.activeElement;
		if (!el || el.getAttribute('contenteditable') === null) return true;
		const rects = range.getClientRects();
		const caret = rects.length ? rects[0] : range.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
		return direction < 0
			? caret.top - box.top < lineHeight * 0.75
			: box.bottom - caret.bottom < lineHeight * 0.75;
	}

	// Bare Up/Down: cross to the neighbour block when the caret sits at this
	// block's visual edge, landing at the same horizontal column. Returns true
	// when it consumed the key (moved); false lets the browser move inside the
	// wrapped block. Places the caret directly (no focusBlockId) so BlockRow's
	// focus effect does not yank the caret to the block's end.
	function handleVerticalArrow(block, direction) {
		if (hasSelection) return false;
		if (!caretAtBlockEdge(direction)) return false;
		const neighborId = neighborVisibleId(blocks, block.id, direction);
		if (!neighborId) return false;
		const x = caretColumnX();
		const el = document.querySelector(
			`[data-block-id="${neighborId}"] [contenteditable], [data-block-id="${neighborId}"] [role="separator"]`
		);
		if (!(el instanceof HTMLElement)) return false;
		el.focus();
		if (el.getAttribute('contenteditable') !== null) {
			if (x == null || !placeCaretAtColumn(el, x, edgeForDirection(direction))) {
				const sel = window.getSelection();
				sel.selectAllChildren(el);
				sel.collapseToEnd();
			}
		}
		return true;
	}

	// Shift+Arrow extends an active block selection, or starts one from the
	// focused block when the caret is at that block's edge. Returns false to let
	// the browser do normal in-line text selection.
	function extendSelection(direction) {
		if (hasSelection) {
			const focus = neighborVisibleId(blocks, selection.focusId, direction);
			if (focus) selection = { anchorId: selection.anchorId, focusId: focus };
			return true;
		}
		if (!activeBlockId || !caretAtBlockEdge(direction)) return false;
		const neighbor = neighborVisibleId(blocks, activeBlockId, direction);
		if (!neighbor) return false;
		selection = { anchorId: activeBlockId, focusId: neighbor };
		return true;
	}

	async function copySelection() {
		const rootIds = orderedSelectionRoots(blocks, selectedIds);
		const trees = rootIds.map((id) => buildCopyTree(blocks, id, true));
		try {
			await writeToClipboard({
				text: trees.map(formatPlainText).join('\n'),
				html: trees.map(formatHtml).join('')
			});
			toast.success(`Copiado (${rootIds.length})`);
		} catch {
			toast.error('No se pudo copiar. Probá de nuevo.');
		}
	}

	async function deleteSelection() {
		recordSnapshot();
		const ids = planDeleteSelection(blocks, selectedIds);
		const last = selectedIds[selectedIds.length - 1];
		const first = selectedIds[0];
		const focusTarget =
			neighborVisibleId(blocks, last, 1) ?? neighborVisibleId(blocks, first, -1);
		selection = null;
		await softDeleteBlocks(ids);
		const removed = new Set(ids);
		blocks = blocks.filter((block) => !removed.has(block.id));
		if (blocks.length === 0) {
			const created = await createBlock({ noteId: note.id, type: 'text' });
			blocks = [created];
			focusBlockId = created.id;
		} else if (focusTarget && blocks.some((block) => block.id === focusTarget)) {
			focusBlockId = focusTarget;
		} else {
			focusBlockId = blocks[0].id;
		}
	}

	async function moveSelectedBlocks(direction) {
		const plan = planMoveSelection(blocks, selectedIds, direction);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		// Reordering moves the focused block's DOM node, which blurs it. Refocus
		// so the next Alt+Arrow still reaches the editor's key handler.
		if (selection) focusBlockId = selection.focusId;
	}

	// Runs in capture phase so it can preempt the focused block's own keys while
	// a multi-block selection is active. stopPropagation is essential: without
	// it the event still reaches the focused block's keydown, double-handling
	// the key (e.g. Alt+Arrow would also do a single-block move — corrupting
	// order at an edge where the group move is a no-op).
	function claim(event) {
		event.preventDefault();
		event.stopPropagation();
	}
	function handleSelectionKeys(event) {
		// Undo/redo win over everything, but only inside a block editable — the
		// note title is a plain <input> and keeps its own native undo.
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && event.target instanceof HTMLElement && event.target.isContentEditable) {
			claim(event);
			if (event.shiftKey) restore(history.redo(currentSnapshot()));
			else restore(history.undo(currentSnapshot()));
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y' && event.target instanceof HTMLElement && event.target.isContentEditable) {
			claim(event);
			restore(history.redo(currentSnapshot()));
			return;
		}
		if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			if (extendSelection(event.key === 'ArrowDown' ? 1 : -1)) claim(event);
			return;
		}
		if (!hasSelection) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
			claim(event);
			copySelection();
			return;
		}
		if (event.key === 'Backspace' || event.key === 'Delete') {
			claim(event);
			deleteSelection();
			return;
		}
		if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			claim(event);
			moveSelectedBlocks(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Escape') {
			claim(event);
			const anchor = selection.focusId;
			clearSelection();
			focusBlockId = anchor;
			return;
		}
		// A bare arrow drops the selection and lets the caret move normally.
		if (!event.altKey && !event.metaKey && !event.ctrlKey && event.key.startsWith('Arrow')) {
			clearSelection();
			return;
		}
		// A plain keystroke drops the selection and resumes normal editing.
		if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
			clearSelection();
		}
	}

	async function refreshTags() {
		const blockIds = blocks.map((block) => block.id);
		const [tags, noteMap, blockMap] = await Promise.all([
			listTags(),
			listTagsForMany('note', [noteId]),
			listTagsForMany('block', blockIds)
		]);
		allTags = tags;
		noteTags = noteMap[noteId] ?? [];
		blockTagsMap = blockMap;
	}

	// Closing a picker must hand focus back to where the user was, otherwise
	// Escape drops the caret to <body> and they have to click back in.
	function closeTagPicker() {
		const target = tagPickerFor;
		tagPickerFor = null;
		if (target?.type === 'block') focusBlockId = target.id;
		else if (target?.type === 'note') titleEl?.focus();
	}

	// One handler for both note and block picks: create the tag if it is new,
	// then toggle the assignment. The picker stays open for multi-tagging.
	async function handleTagPick(option) {
		const target = tagPickerFor;
		if (!target) return;
		const tag = option.kind === 'create' ? await findOrCreateTag(option.name) : option.tag;
		if (!tag) return;
		if (option.kind === 'tag' && option.assigned) {
			await unassignTag(tag.id, target.type, target.id);
		} else {
			await assignTag(tag.id, target.type, target.id);
		}
		await refreshTags();
		if (onTagsChanged) onTagsChanged();
	}

	async function removeTag(type, id, tag) {
		await unassignTag(tag.id, type, id);
		await refreshTags();
		if (onTagsChanged) onTagsChanged();
	}

	function cancelPending(key) {
		const entry = pending.get(key);
		if (entry) {
			clearTimeout(entry.timer);
			pending.delete(key);
		}
	}

	async function insertSnippetBlocks(snippet, afterId) {
		recordSnapshot();
		// $state proxies can't be structured-cloned into IndexedDB.
		const plan = planSnippetInsertion($state.snapshot(blocks), $state.snapshot(snippet), {
			noteId: note.id,
			afterId,
			createId
		});
		await applyInsertionPlan(plan);
		for (const update of plan.updates) {
			const row = blocks.find((block) => block.id === update.id);
			if (row) row.order = update.order;
		}
		blocks = [...blocks, ...plan.newBlocks];
		focusBlockId = plan.focusId;
	}

	async function applySnippetPick(snippet) {
		const row = blocks.find((block) => block.id === slash.blockId);
		slash = null;
		if (!row) return;
		await insertSnippetBlocks(snippet, row.id);
		// The "/…" row only existed to open the picker. Drop it — unless it has
		// children, in which case deleting it would orphan them.
		const hasChildren = blocks.some((block) => (block.parentBlockId ?? null) === row.id);
		cancelPending(`block:${row.id}`);
		if (hasChildren) {
			row.content = '';
			await updateBlock(row.id, { content: '' });
		} else {
			await softDeleteBlock(row.id);
			blocks = blocks.filter((block) => block.id !== row.id);
		}
	}

	// Called from the page when the user inserts from the snippets library.
	export async function insertSnippet(snippet) {
		const active = activeBlockId && blocks.some((block) => block.id === activeBlockId);
		const afterId = active
			? activeBlockId
			: (visible.length ? visible[visible.length - 1].block.id : null);
		await insertSnippetBlocks(snippet, afterId);
		toast.success('Snippet insertado');
	}

	async function handleSaveSnippet(block) {
		const fields = snippetFieldsFromBlocks($state.snapshot(blocks), block.id, note.id);
		await createSnippet(fields);
		toast.success('Snippet guardado');
		if (onSnippetsChanged) onSnippetsChanged();
	}

	async function applySlashCommand(command) {
		if (command.kind === 'snippet') {
			await applySnippetPick(command.snippet);
			return;
		}
		const row = blocks.find((block) => block.id === slash.blockId);
		if (command.id === 'snippet') {
			// Switch the menu into snippet-picker mode; the block keeps its "/"
			// so typing keeps filtering the snippet list.
			const snippets = await listSnippets();
			slash = { blockId: slash.blockId, query: '', index: 0, mode: 'snippets', snippets };
			if (row) {
				row.content = '/';
				focusBlockId = row.id;
			}
			return;
		}
		slash = null;
		if (!row) return;
		if (command.id === 'separator') {
			row.type = 'separator';
			row.content = '';
			await updateBlock(row.id, { type: 'separator', content: '' });
			await handleEnter(row, 'text');
			return;
		}
		row.type = command.id;
		row.content = '';
		const changes = { type: command.id, content: '' };
		if (command.id === 'todo') {
			row.checked = false;
			changes.checked = false;
		}
		await updateBlock(row.id, changes);
		focusBlockId = row.id;
	}

	function handleSlashKey(key) {
		if (!slash) return;
		if (key === 'Escape') {
			slash = null;
			return;
		}
		if (key === 'ArrowDown') {
			slash.index = moveSelection(slash.index, 1, slashCommands.length);
			return;
		}
		if (key === 'ArrowUp') {
			slash.index = moveSelection(slash.index, -1, slashCommands.length);
			return;
		}
		if (key === 'Enter') {
			const command = slashCommands[slash.index];
			if (command) applySlashCommand(command);
			else slash = null;
		}
	}
</script>

{#if note}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="mx-auto w-full max-w-(--editor-max-width) px-6 py-10 md:py-14 {dragging
			? 'select-none'
			: ''}"
		onkeydowncapture={handleSelectionKeys}
	>
		<div class="sr-only" role="status" aria-live="polite">{selectionAnnouncement}</div>
		<div class="group/title flex items-center gap-2">
			<input
				bind:this={titleEl}
				value={note.title}
				oninput={handleTitleInput}
				onkeydown={handleTitleKeydown}
				placeholder="Sin título"
				aria-label="Título de la nota"
				autocomplete="off"
				name="note-title"
				class="placeholder:text-faint min-w-0 flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none md:text-4xl"
			/>
			<div class="relative shrink-0">
				<button
					type="button"
					aria-label="Etiquetar nota"
					use:tooltip={'Etiquetar nota'}
					onclick={() =>
						(tagPickerFor = tagPickerFor?.type === 'note' ? null : { type: 'note', id: note.id })}
					aria-expanded={tagPickerFor?.type === 'note'}
					class="text-faint hover:text-foreground focus-visible:ring-ring flex size-8 items-center justify-center rounded-md transition-all duration-(--motion-fast) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none {tagPickerFor?.type ===
						'note' || noteTags.length > 0
						? 'opacity-100'
						: 'opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100'}"
				>
					<Tag size={18} aria-hidden="true" />
				</button>
				{#if tagPickerFor?.type === 'note'}
					<TagPicker
						tags={allTags}
						assignedIds={noteTags.map((tag) => tag.id)}
						onPick={handleTagPick}
						onClose={closeTagPicker}
						align="right"
					/>
				{/if}
			</div>
		</div>
		{#if noteTags.length > 0}
			<div class="mt-3 flex flex-wrap items-center gap-1.5">
				<TagChips tags={noteTags} onRemove={(tag) => removeTag('note', note.id, tag)} />
			</div>
		{/if}
		<div class="mt-6 flex flex-col">
			{#each visible as row, index (row.block.id)}
				<BlockRow
					block={row.block}
					depth={row.depth}
					hasChildren={row.hasChildren}
					focused={focusBlockId === row.block.id}
					placeholder={index === 0 && visible.length === 1 ? 'Escribí algo, o "/" para elegir tipo…' : ''}
					slashOpen={slash !== null && slash.blockId === row.block.id}
					{slashCommands}
					slashIndex={slash ? slash.index : 0}
					onInput={handleBlockInput}
					onNoteInput={handleNoteInput}
					onEnter={handleEnter}
					onBackspaceEmpty={handleBackspaceEmpty}
					onIndent={handleIndent}
					onOutdent={handleOutdent}
					onMoveUp={handleMoveUp}
					onMoveDown={handleMoveDown}
					onToggleCollapsed={handleToggleCollapsed}
					onToggleChecked={handleToggleChecked}
					onCopy={handleCopy}
					onSaveSnippet={handleSaveSnippet}
					onActive={(row) => (activeBlockId = row.id)}
					selected={selectedSet.has(row.block.id)}
					onShiftSelect={shiftSelect}
					onPlainMousedown={startDrag}
					onDragOver={dragOver}
					tags={blockTagsMap[row.block.id] ?? []}
					{allTags}
					tagPickerOpen={tagPickerFor?.type === 'block' && tagPickerFor.id === row.block.id}
					onTag={(block) =>
						(tagPickerFor =
							tagPickerFor?.type === 'block' && tagPickerFor.id === block.id
								? null
								: { type: 'block', id: block.id })}
					onUntag={(block, tag) => removeTag('block', block.id, tag)}
					onTagPick={handleTagPick}
					onTagPickerClose={closeTagPicker}
					onSlashKey={handleSlashKey}
					onSlashSelect={applySlashCommand}
					onVerticalArrow={handleVerticalArrow}
					onPasteLines={handlePasteLines}
					onFocusHandled={() => (focusBlockId = null)}
					slashEmptyLabel={slash?.mode === 'snippets'
						? 'Todavía no guardaste snippets.'
						: 'Sin resultados'}
				/>
			{/each}
		</div>
	</div>
{/if}
