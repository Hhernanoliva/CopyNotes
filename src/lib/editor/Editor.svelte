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
		updateNote,
		writeJournal,
		clearJournal
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
	import { treeToNode, flattenNode, serializeForest } from '$lib/copy/serialize';
	import { writeToClipboard } from '$lib/copy/clipboard';
	import { toast } from 'svelte-sonner';
	import { filterCommands, moveSelection, nextSlashState } from './slash';
	import { caretColumnX, placeCaretAtColumn, edgeForDirection } from './caret';
	import { looksLikeCodePaste, parsePastedLines } from './paste';
	import { createHistory, diffBlocks } from './history';
	import BlockRow from './BlockRow.svelte';
	import { createDragReorder } from './dragReorder.svelte.js';
	import FloatingFormattingToolbar from './FloatingFormattingToolbar.svelte';
	import { textOffset, rangeFromTextOffsets } from './selection-offsets';
	import {
		sanitizeHtml,
		htmlToPlainText,
		plainTextToHtml,
		removePlainTextRange,
		planBlockType,
		HEADING_TYPES,
		activeFormatsFor,
		commandsForSelection,
		applyInline,
		toggleCode,
		applyColor,
		applyLink,
		removeLink
	} from '$lib/format';

	let {
		noteId,
		initialFocusBlockId = null,
		onNoteUpdated,
		onSaveStateChange,
		onSnippetsChanged,
		onTagsChanged
	} = $props();

	let note = $state(null);
	let blocks = $state([]);
	let focusBlockId = $state(null);
	// Plain-text caret offset to restore when focusBlockId lands (or null for
	// caret-at-end). Set by slash-menu flows so the caret returns to where the
	// "/" was typed; cleared together with focusBlockId in onFocusHandled.
	let focusCaret = $state(null);
	// Last block the user touched; snippet insertion from the sidebar lands here.
	let activeBlockId = $state(null);
	let titleEl = $state();
	// Slash menu state: which block it is anchored to, the plain-text offset of
	// the "/" (anchor), the text typed after it, and the highlighted option.
	// mode 'snippets' means /snippet was chosen and the menu now lists saved
	// snippets instead of block types.
	let slash = $state(null);
	// Which block's date panel is open (spec 021 Slice A), or null.
	let datePanelFor = $state(null);
	// Caret offset to restore after the date panel closes, when it was opened
	// via /fecha (null = caret at the end, e.g. opened from the badge).
	let datePanelCaret = null;
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
	// Drag-to-reorder-and-nest controller (long-press, mouse + touch). Pure
	// hierarchy math lives in resolveDrop/planDrop; this just applies the plan.
	let listEl = $state();
	const reorder = createDragReorder({
		getBlocks: () => blocks,
		getSelectedIds: () => (hasSelection ? selectedIds : []),
		getListEl: () => listEl,
		onApply: async (plan) => {
			recordSnapshot();
			await applyUpdates(plan.updates);
		}
	});
	$effect(() => () => reorder.destroy());
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
	// when the user switches notes quickly. Each entry also carries a plain
	// journal payload ({ table, id, changes }) because the last-chance path
	// below cannot run the async save closures.
	const pending = new Map();

	function scheduleSave(key, save, journal) {
		onSaveStateChange('saving');
		const existing = pending.get(key);
		if (existing) clearTimeout(existing.timer);
		// The entry leaves the map only after its write really finished, so the
		// journal still covers a save that is in flight when the page dies (the
		// browser discards unfinished IndexedDB writes on unload). The identity
		// check protects a newer entry that replaced this one meanwhile.
		const entry = {
			save,
			journal,
			timer: setTimeout(async () => {
				await save();
				if (pending.get(key) === entry) pending.delete(key);
				if (pending.size === 0) onSaveStateChange('saved');
			}, 500)
		};
		pending.set(key, entry);
	}

	function flushPending() {
		const saves = [];
		for (const [key, entry] of pending) {
			clearTimeout(entry.timer);
			// Saves are plain field updates, so re-running one that the timer
			// already started is harmless.
			saves.push(
				entry.save().then(() => {
					if (pending.get(key) === entry) pending.delete(key);
				})
			);
		}
		return Promise.all(saves);
	}

	function persistJournal() {
		writeJournal([...pending.values()].map((entry) => entry.journal).filter(Boolean));
	}

	$effect(() => () => flushPending());

	// A reload/close/navigation never unmounts the component, so the unmount
	// flush above cannot run — and IndexedDB writes started while the page
	// unloads are discarded by the browser anyway. The journal in localStorage
	// is synchronous, survives unload, and is replayed on the next boot. A
	// hidden tab may later be killed without pagehide (mobile), so it journals
	// too, then clears once its flushed saves have really landed.
	$effect(() => {
		const journalOnPageHide = () => persistJournal();
		const flushWhenHidden = async () => {
			if (document.visibilityState !== 'hidden') return;
			persistJournal();
			await flushPending();
			clearJournal();
		};
		window.addEventListener('pagehide', journalOnPageHide);
		document.addEventListener('visibilitychange', flushWhenHidden);
		return () => {
			window.removeEventListener('pagehide', journalOnPageHide);
			document.removeEventListener('visibilitychange', flushWhenHidden);
		};
	});

	$effect(() => {
		const id = noteId;
		let cancelled = false;
		// Hide the previous note while the next one loads. Leaving its rows and
		// title visible lets fast typing land edits on the wrong note (the load
		// window widens under I/O contention — caught by the e2e suite).
		note = null;
		blocks = [];
		(async () => {
			const [loadedNote, loadedBlocks] = await Promise.all([getNote(id), listBlocksByNote(id)]);
			if (cancelled) return;
			note = loadedNote;
			blocks = loadedBlocks;
			activeBlockId = null;
			history.reset();
			lastTextBlockId = null;
			const jumpingToBlock =
				initialFocusBlockId && loadedBlocks.some((block) => block.id === initialFocusBlockId);
			if (jumpingToBlock) {
				focusBlockId = initialFocusBlockId;
			}
			await refreshTags();
			// An empty title only grabs focus when we did not land here to jump to a
			// specific block (spec 021 Slice B) — the Agenda's request wins.
			if (note && note.title === '' && titleEl && !jumpingToBlock) {
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
		scheduleSave(
			`title:${note.id}`,
			async () => {
				await updateNote(note.id, { title });
				onNoteUpdated(note.id, { title });
			},
			{ table: 'notes', id: note.id, changes: { title } }
		);
	}

	function handleTitleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length > 0) focusBlockId = visible[0].block.id;
		}
	}

	function handleBlockInput(block, payload) {
		const text = payload.content;
		const html = payload.html;
		recordTextSnapshot(block.id);
		// Typing "/" anywhere in the block opens the slash menu; what follows up
		// to the caret is the query. Code blocks are exempt, slashes are normal
		// there. The snippet-picker mode survives while the user narrows the
		// query, because only the query changes — the anchor stays put.
		if (block.type !== 'code') {
			const prev = slash && slash.blockId === block.id ? { anchor: slash.anchor, query: slash.query } : null;
			const next = nextSlashState(prev, {
				prevText: block.content ?? '',
				text,
				caret: payload.caret ?? null
			});
			if (next && prev) {
				slash.query = next.query;
				slash.index = 0;
			} else if (next) {
				slash = { blockId: block.id, anchor: next.anchor, query: next.query, index: 0, mode: 'commands' };
			} else if (slash && slash.blockId === block.id) {
				slash = null;
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
			block.html = plainTextToHtml(trigger.content);
			updateBlock(block.id, { type: 'bullet', content: trigger.content, html: plainTextToHtml(trigger.content) });
			return;
		}
		if (trigger?.kind === 'tag') {
			// Drop the "#" and open the tag picker anchored to this block.
			cancelPending(`block:${block.id}`);
			block.content = '';
			block.html = '';
			updateBlock(block.id, { content: '', html: '' });
			tagPickerFor = { type: 'block', id: block.id, restoreHash: true };
			return true;
		}
		block.content = text;
		block.html = html;
		scheduleSave(`block:${block.id}`, () => updateBlock(block.id, { content: text, html }), {
			table: 'blocks',
			id: block.id,
			changes: { content: text, html }
		});
	}

	// Convert a block to a different type (e.g. heading) via the format engine's
	// planner, which decides which fields change.
	async function setBlockType(block, nextType) {
		const changes = planBlockType(block, nextType);
		Object.assign(block, changes);
		await updateBlock(block.id, changes);
	}

	// --- Floating formatting toolbar (spec: toolbar wiring) ---
	// Tracks the live DOM selection and derives what the toolbar should show:
	// its position, which marks/heading are active, and which commands make
	// sense for the current selection. Rebuilt from scratch on every selection
	// change so the toolbar's own $derived state reacts to it.
	let toolbar = $state(null); // { rect, active, enabled, blockId, color, linkUrl }
	// Sequence counter to make repeated Ctrl/Cmd+K requests unique (Svelte 5 $effect
	// reactive dependency must change for the effect to re-run on the second press).
	let linkRequestSeq = 0;

	function editableFor(node) {
		let el = node?.nodeType === 1 ? node : node?.parentNode;
		while (el && !(el.classList && el.classList.contains('block-editable'))) el = el.parentNode;
		return el;
	}

	function refreshToolbar() {
		// The link popover autofocuses its URL input (and any future popover
		// content lives inside the toolbar's own DOM too). That focus change
		// fires selectionchange with a collapsed, unrelated selection — without
		// this guard we'd immediately null the toolbar out from under the user,
		// closing the popover they just opened. Leave existing state alone while
		// focus sits inside the toolbar itself.
		if (toolbar && document.activeElement?.closest('[data-copynotes-toolbar]')) {
			return;
		}
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) { toolbar = null; return; }
		const range = sel.getRangeAt(0);
		const startEditable = editableFor(range.startContainer);
		const endEditable = editableFor(range.endContainer);
		if (!startEditable) { toolbar = null; return; }
		// Show on a real selection, or when the caret sits inside formatted text.
		const marks = activeFormatsFor(range.startContainer, startEditable);
		const hasMark = marks.bold || marks.italic || marks.underline || marks.strike || marks.code || marks.link || marks.color;
		if (sel.isCollapsed && !hasMark) { toolbar = null; return; }

		const row = startEditable.closest('[data-block-id]');
		const block = blocks.find((b) => b.id === row?.dataset.blockId);
		if (!block) { toolbar = null; return; }
		const spansBlocks = startEditable !== endEditable;

		toolbar = {
			rect: range.getBoundingClientRect(),
			// Commands dispatched from a popover (the link editor) fire after DOM
			// focus has moved into that popover's own input, which collapses
			// window.getSelection() away from this range. Keep a clone so the
			// command handler can restore it before mutating the DOM.
			savedRange: range.cloneRange(),
			blockId: block.id,
			color: marks.color,
			linkUrl: currentLinkHref(range),
			active: {
				...marks,
				h1: block.type === 'heading1', h2: block.type === 'heading2',
				h3: block.type === 'heading3', normal: block.type === 'text'
			},
			enabled: commandsForSelection({ blockType: block.type, spansBlocks })
		};
	}

	// Ctrl/Cmd+K from a block with no toolbar visible: rebuild the toolbar from
	// the current selection, then request its link panel open. If there is no
	// usable selection/caret in a rich block (toolbar stays null), do nothing —
	// a link needs something to attach it to.
	function handleRequestLink() {
		refreshToolbar();
		if (toolbar) {
			linkRequestSeq += 1;
			toolbar = { ...toolbar, requestPanel: { panel: 'link', seq: linkRequestSeq } };
		}
	}

	function currentLinkHref(range) {
		let el = range.startContainer;
		el = el.nodeType === 1 ? el : el.parentNode;
		while (el && !(el.classList && el.classList.contains('block-editable'))) {
			if (el.tagName?.toLowerCase() === 'a') return el.getAttribute('href') ?? '';
			el = el.parentNode;
		}
		return '';
	}

	$effect(() => {
		document.addEventListener('selectionchange', refreshToolbar);
		return () => document.removeEventListener('selectionchange', refreshToolbar);
	});

	// Commands mutate the contenteditable DOM directly (execCommand / manual DOM
	// wraps), so the affected block's state is stale afterwards — re-read its
	// innerHTML and persist it.
	//
	// sanitizeHtml can normalize the markup (e.g. execCommand's <b> becomes
	// <strong>), so the sanitized string usually differs from the raw DOM.
	// BlockRow's own sync effect compares block.html against the live
	// el.innerHTML and overwrites the DOM the moment they diverge — which would
	// otherwise replace the very nodes the current selection points at,
	// silently collapsing it a tick later. Apply the sanitized HTML to the DOM
	// ourselves (so that later comparison is a no-op) and restore the selection
	// by character offset, which survives the node replacement.
	function persistActiveBlock() {
		const row = document.querySelector(`[data-block-id="${toolbar?.blockId}"] .block-editable`);
		if (!row) return;
		const block = blocks.find((b) => b.id === toolbar.blockId);
		if (!block) return;
		const sel = window.getSelection();
		let start = null;
		let end = null;
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0);
			if (row.contains(range.startContainer) && row.contains(range.endContainer)) {
				start = textOffset(row, range.startContainer, range.startOffset);
				end = textOffset(row, range.endContainer, range.endOffset);
			}
		}
		const html = sanitizeHtml(row.innerHTML);
		if (row.innerHTML !== html) {
			row.innerHTML = html;
			if (start !== null && end !== null) {
				const restored = rangeFromTextOffsets(row, start, end);
				sel.removeAllRanges();
				sel.addRange(restored);
			}
		}
		block.html = html;
		block.content = htmlToPlainText(html);
		updateBlock(block.id, { html: block.html, content: block.content });
	}

	// Popover-dispatched commands (currently just the link editor's Save/Remove
	// buttons) fire after focus already moved into the popover's own input, so
	// window.getSelection() no longer points at the text the toolbar was opened
	// for. Re-apply the range captured when the toolbar last refreshed before
	// any command that reads the live selection.
	function restoreSavedSelection() {
		if (!toolbar?.savedRange) return;
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(toolbar.savedRange);
	}

	async function handleToolbarCommand(name, arg) {
		const block = blocks.find((b) => b.id === toolbar?.blockId);
		if (!block) return;
		restoreSavedSelection();
		switch (name) {
			case 'h1': return void setBlockType(block, 'heading1');
			case 'h2': return void setBlockType(block, 'heading2');
			case 'h3': return void setBlockType(block, 'heading3');
			case 'normal': return void setBlockType(block, 'text');
			case 'bold': applyInline('bold'); break;
			case 'italic': applyInline('italic'); break;
			case 'underline': applyInline('underline'); break;
			case 'strike': applyInline('strikethrough'); break;
			case 'code': toggleCode(); break;
			case 'color': applyColor(arg); break;
			case 'link': if (!applyLink(arg)) return; break;
			case 'removeLink': removeLink(); break;
			case 'clear': document.execCommand('removeFormat'); break;
			case 'copyText': {
				const text = window.getSelection()?.toString() ?? '';
				if (text && navigator.clipboard) await navigator.clipboard.writeText(text);
				return;
			}
		}
		persistActiveBlock();
		refreshToolbar();
	}

	function handleNoteInput(block, text) {
		recordTextSnapshot(`note:${block.id}`);
		block.note = text;
		scheduleSave(`note:${block.id}`, () => updateBlock(block.id, { note: text }), {
			table: 'blocks',
			id: block.id,
			changes: { note: text }
		});
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
			block.html = first.html ?? plainTextToHtml(first.content);
			const changes = {
				type: first.type,
				content: first.content,
				html: first.html ?? plainTextToHtml(first.content)
			};
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

	// An external multi-line paste with clear syntax signals becomes one literal
	// code block. The detector is intentionally conservative: returning false
	// hands the same text back to the normal multi-line parser.
	function handlePasteCode(block, text) {
		if (!looksLikeCodePaste(text)) return false;
		recordSnapshot();
		cancelPending(`block:${block.id}`);
		if (slash?.blockId === block.id) slash = null;
		block.type = 'code';
		block.content = text;
		block.html = text;
		block.checked = false;
		block.codeCollapsed = false;
		updateBlock(block.id, {
			type: 'code',
			content: text,
			html: text,
			checked: false,
			codeCollapsed: false
		});
		focusBlockId = block.id;
		return true;
	}

	// Paste of CopyNotes' own copied content: rebuild the exact blocks (types,
	// checked, code, nesting) from the hidden clipboard marker. Each forest root
	// lands as a sibling after the current block, reusing the snippet-insertion
	// machinery; an empty origin block is dropped so the paste reads clean.
	async function handlePasteBlocks(block, forest) {
		if (!forest || forest.length === 0) return;
		recordSnapshot();
		let afterId = block.id;
		let tagsTouched = false;
		for (const root of forest) {
			const plan = planSnippetInsertion(
				$state.snapshot(blocks),
				{ blockSnapshot: root },
				{ noteId: note.id, afterId, createId }
			);
			await applyInsertionPlan(plan);
			for (const update of plan.updates) {
				const row = blocks.find((item) => item.id === update.id);
				if (row) row.order = update.order;
			}
			blocks = [...blocks, ...plan.newBlocks];
			// New blocks come out in pre-order, same as the flattened source nodes,
			// so tags line up 1:1. Re-create the tag by name and assign it.
			const sourceNodes = flattenNode(root);
			for (let i = 0; i < plan.newBlocks.length; i++) {
				for (const name of sourceNodes[i]?.tags ?? []) {
					const tag = await findOrCreateTag(name);
					if (tag) {
						await assignTag(tag.id, 'block', plan.newBlocks[i].id);
						tagsTouched = true;
					}
				}
			}
			afterId = plan.newBlocks[0].id;
		}
		if (tagsTouched) {
			await refreshTags();
			if (onTagsChanged) onTagsChanged();
		}
		const origin = blocks.find((item) => item.id === block.id);
		const originHasChildren = blocks.some((item) => (item.parentBlockId ?? null) === block.id);
		if (origin && (origin.content ?? '') === '' && origin.type !== 'separator' && !originHasChildren) {
			cancelPending(`block:${block.id}`);
			await softDeleteBlock(block.id);
			blocks = blocks.filter((item) => item.id !== block.id);
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

	async function handleToggleCodeCollapsed(block) {
		recordSnapshot();
		block.codeCollapsed = !(block.codeCollapsed ?? false);
		await updateBlock(block.id, { codeCollapsed: block.codeCollapsed });
	}

	async function handleCopy(block, withChildren) {
		const tree = buildCopyTree(blocks, block.id, withChildren);
		try {
			await writeToClipboard({
				text: formatPlainText(tree),
				html: formatHtml(tree),
				custom: serializeForest([treeToNode(tree, blockTagsMap)])
			});
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
		if (reorder.active) return; // a block-move drag owns the pointer
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
		const el = document.querySelector(`[data-block-id="${neighborId}"] [data-block-surface]`);
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
				html: trees.map(formatHtml).join(''),
				custom: serializeForest(trees.map((tree) => treeToNode(tree, blockTagsMap)))
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
	// Every focusable block surface (editable, separator, collapsed-code toggle)
	// carries data-block-surface, so new block controls only need the attribute.
	// isContentEditable stays so the note editable keeps undo/copy handling.
	function isBlockKeyboardTarget(target) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.hasAttribute('data-block-surface'))
		);
	}
	function handleSelectionKeys(event) {
		// Undo/redo win over everything inside a block or its collapsed-code
		// control. The note title is a plain <input> and keeps native undo.
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && isBlockKeyboardTarget(event.target)) {
			claim(event);
			if (event.shiftKey) restore(history.redo(currentSnapshot()));
			else restore(history.undo(currentSnapshot()));
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y' && isBlockKeyboardTarget(event.target)) {
			claim(event);
			restore(history.redo(currentSnapshot()));
			return;
		}
		if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			if (extendSelection(event.key === 'ArrowDown' ? 1 : -1)) claim(event);
			return;
		}
		// Cmd/Ctrl+C with no multi-selection and a collapsed caret inside a block:
		// copy that whole block richly (custom format) so code, separators and
		// tags survive a paste. A real in-block text selection falls through to
		// the browser's native copy of just that text.
		if (
			(event.metaKey || event.ctrlKey) &&
			event.key.toLowerCase() === 'c' &&
			!hasSelection &&
			isBlockKeyboardTarget(event.target)
		) {
			const sel = window.getSelection();
			const activeBlock = activeBlockId && blocks.find((block) => block.id === activeBlockId);
			const wholeBlockControl =
				!event.target.isContentEditable && event.target.hasAttribute('data-block-surface');
			if ((wholeBlockControl || !sel || sel.isCollapsed) && activeBlock) {
				claim(event);
				handleCopy(activeBlock, false);
			}
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
	// Any close without a pick (Escape, click outside) returns the typed "#";
	// handleTagPick clears restoreHash the moment a tag is confirmed.
	function closeTagPicker() {
		const target = tagPickerFor;
		tagPickerFor = null;
		if (target?.type === 'block' && target.restoreHash) {
			const block = blocks.find((row) => row.id === target.id);
			if (block) {
				block.content = '#';
				block.html = plainTextToHtml('#');
				updateBlock(block.id, { content: block.content, html: block.html });
			}
		}
		if (target?.type === 'block') focusBlockId = target.id;
		else if (target?.type === 'note') titleEl?.focus();
	}

	// One handler for both note and block picks: create the tag if it is new,
	// then toggle the assignment. The picker stays open for multi-tagging.
	async function handleTagPick(option) {
		const target = tagPickerFor;
		if (!target) return;
		// Enter/click confirms the choice immediately. Do not let a quick Escape
		// restore "#" while the local database finishes creating the tag.
		if (target.restoreHash) tagPickerFor = { ...target, restoreHash: false };
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

	// Remove the "/query" span from a row's plain content and html, preserving
	// the surrounding inline formatting. keepSlash leaves the "/" itself in
	// place (snippet-picker mode keeps filtering off it).
	function strippedSlashFields(row, anchor, query, keepSlash = false) {
		const start = anchor + (keepSlash ? 1 : 0);
		const end = anchor + 1 + query.length;
		const plain = row.content ?? '';
		const content = plain.slice(0, start) + plain.slice(end);
		const html =
			(row.html ?? '') !== '' ? removePlainTextRange(row.html, start, end) : plainTextToHtml(content);
		return { content, html };
	}

	async function applySnippetPick(snippet) {
		const row = blocks.find((block) => block.id === slash.blockId);
		const stripped = row ? strippedSlashFields(row, slash.anchor, slash.query) : null;
		slash = null;
		if (!row) return;
		await insertSnippetBlocks(snippet, row.id);
		// The "/…" span only existed to drive the picker. Strip it; when nothing
		// remains and the row has no children, drop the row entirely (deleting a
		// parent would orphan its children).
		const hasChildren = blocks.some((block) => (block.parentBlockId ?? null) === row.id);
		cancelPending(`block:${row.id}`);
		if (stripped.content === '' && !hasChildren) {
			await softDeleteBlock(row.id);
			blocks = blocks.filter((block) => block.id !== row.id);
		} else {
			row.content = stripped.content;
			row.html = stripped.html;
			await updateBlock(row.id, { content: stripped.content, html: stripped.html });
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
		if (!row) {
			slash = null;
			return;
		}
		const anchor = slash.anchor;
		// The last keystroke of "/query" left a debounced content save behind;
		// fired later it would re-write the text this command strips.
		cancelPending(`block:${row.id}`);
		if (command.id === 'snippet') {
			// Switch the menu into snippet-picker mode; the block keeps its "/"
			// so typing keeps filtering the snippet list.
			const snippets = await listSnippets();
			const kept = strippedSlashFields(row, anchor, slash.query, true);
			row.content = kept.content;
			row.html = kept.html;
			await updateBlock(row.id, { content: kept.content, html: kept.html });
			slash = { blockId: slash.blockId, anchor, query: '', index: 0, mode: 'snippets', snippets };
			focusBlockId = row.id;
			focusCaret = anchor + 1;
			return;
		}
		// Strip the "/query" span; whatever the user had typed around it stays,
		// and the caret goes back to where the "/" was.
		const stripped = strippedSlashFields(row, anchor, slash.query);
		slash = null;
		row.content = stripped.content;
		row.html = stripped.html;
		await updateBlock(row.id, { content: stripped.content, html: stripped.html });
		if (HEADING_TYPES.includes(command.id)) {
			// Headings are a type change, not an insert, so no new block is created.
			await setBlockType(row, command.id);
			focusBlockId = row.id;
			focusCaret = anchor;
			return;
		}
		if (command.id === 'date') {
			// The block keeps its type — a date is a field, not a block type.
			datePanelFor = row.id;
			datePanelCaret = anchor;
			return;
		}
		if (command.id === 'separator') {
			if (stripped.content === '') {
				row.type = 'separator';
				await updateBlock(row.id, { type: 'separator' });
				await handleEnter(row, 'text');
				return;
			}
			// The block has real text: keep it and insert the separator below,
			// followed by the empty text block the empty-block flow also leaves.
			await handleEnter(row, 'separator');
			const separator = blocks.find((block) => block.id === focusBlockId);
			if (separator) await handleEnter(separator, 'text');
			return;
		}
		row.type = command.id;
		if (command.id === 'code') row.html = row.content;
		const changes = { type: command.id, html: row.html };
		if (command.id === 'todo') {
			row.checked = false;
			changes.checked = false;
		}
		await updateBlock(row.id, changes);
		focusBlockId = row.id;
		focusCaret = anchor;
	}

	async function handleDatePick(block, day) {
		datePanelFor = null;
		recordSnapshot();
		block.dueDate = day;
		// Structural change: persist immediately, never debounced.
		await updateBlock(block.id, { dueDate: day });
		focusBlockId = block.id;
		focusCaret = datePanelCaret;
		datePanelCaret = null;
	}

	async function handleDateRemove(block) {
		datePanelFor = null;
		recordSnapshot();
		block.dueDate = null;
		await updateBlock(block.id, { dueDate: null });
		focusBlockId = block.id;
		focusCaret = datePanelCaret;
		datePanelCaret = null;
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
		class="mx-auto w-full max-w-(--editor-max-width) px-[0.9rem] py-6 md:px-6 md:py-14 {dragging
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
		<div class="relative mt-6 flex flex-col" bind:this={listEl}>
			{#if reorder.indicator}
				<div
					class="pointer-events-none absolute z-10 h-0.5 bg-primary"
					style="left: {reorder.indicator.depth * 1.5}rem; right: 0; top: {reorder.indicator.top}px;"
				></div>
			{/if}
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
					onToggleCodeCollapsed={handleToggleCodeCollapsed}
					onToggleChecked={handleToggleChecked}
					onCopy={handleCopy}
					onSaveSnippet={handleSaveSnippet}
					onActive={(row) => (activeBlockId = row.id)}
					selected={selectedSet.has(row.block.id)}
					onShiftSelect={shiftSelect}
					onPlainMousedown={startDrag}
					onDragOver={dragOver}
					onDragHold={(id, event) => reorder.armFromPointer(id, event)}
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
					onPasteBlocks={handlePasteBlocks}
					onPasteCode={handlePasteCode}
					onRequestLink={handleRequestLink}
					focusCaret={focusBlockId === row.block.id ? focusCaret : null}
					onFocusHandled={() => {
						focusBlockId = null;
						focusCaret = null;
					}}
					datePanelOpen={datePanelFor === row.block.id}
					onDateBadge={(block) => {
						datePanelCaret = null;
						datePanelFor = datePanelFor === block.id ? null : block.id;
					}}
					onDatePick={handleDatePick}
					onDateRemove={handleDateRemove}
					onDatePanelClose={() => {
						datePanelFor = null;
						datePanelCaret = null;
					}}
					slashEmptyLabel={slash?.mode === 'snippets'
						? 'Todavía no guardaste snippets.'
						: 'Sin resultados'}
				/>
			{/each}
		</div>
	</div>
	{#if toolbar}
		<FloatingFormattingToolbar
			rect={toolbar.rect}
			active={toolbar.active}
			enabled={toolbar.enabled}
			currentColor={toolbar.color}
			currentLinkUrl={toolbar.linkUrl}
			requestPanel={toolbar.requestPanel ?? null}
			onCommand={handleToolbarCommand}
			onClose={() => (toolbar = null)}
		/>
	{/if}
	{#if reorder.ghost}
		<div
			class="pointer-events-none fixed z-50 rounded-md bg-card px-2 py-1 text-sm opacity-80 shadow-lg"
			style="left: {reorder.ghost.x + 12}px; top: {reorder.ghost.y + 12}px;"
		>
			Moviendo {reorder.ghost.ids.length}
			{reorder.ghost.ids.length === 1 ? 'renglón' : 'renglones'}
		</div>
	{/if}
{/if}
