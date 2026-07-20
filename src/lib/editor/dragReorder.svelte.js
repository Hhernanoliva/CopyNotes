// Pointer-Events drag controller for block reorder + nest. Long-press to arm
// (works for mouse and touch on one path), then track the pointer to drive a
// live indicator and a floating ghost. On release it asks planDrop for the
// update plan and hands it to the editor. Escape or an out-of-list release
// cancels with no changes. All hierarchy math is delegated to the pure
// resolveDrop/planDrop; this file only measures the DOM and holds UI state.

import { buildVisibleList } from '$lib/blocks/hierarchy';
import { orderedSelectionRoots } from '$lib/blocks/selection';
import { resolveDrop } from '$lib/blocks/resolve';
import { planDrop } from '$lib/blocks/drop';

const HOLD_MS = 350;
const MOVE_CANCEL_PX = 6;
const INDENT_PX = 24; // 1.5rem
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_SPEED = 8;

export function createDragReorder({
	getBlocks,
	getSelectedIds,
	getListEl,
	onApply,
	onSelectionClick = () => {}
}) {
	let active = $state(false);
	let indicator = $state(null); // { top, depth } — top is list-relative px
	let ghost = $state(null); // { x, y, ids } — x/y are viewport px (position: fixed)

	let holdTimer = null;
	let startX = 0;
	let startY = 0;
	let grabDepth = 0; // depth of the grabbed row, so nesting is relative to it
	let draggedIds = [];
	let scrollRAF = null;
	// Handle drags skip the long-press: the grip is not editable, so there is no
	// text-selection to disambiguate from. Arm on pointerdown, activate on the
	// first real move. A press with no move stays a plain click.
	let handleArmed = false;
	// True when this arm started on a row already in the multi-selection. Same
	// no-long-press behaviour as the grip, but a plain release (no drag) calls
	// onSelectionClick so the editor can collapse the selection to a caret.
	let armedOnSelection = false;

	function cleanup() {
		clearTimeout(holdTimer);
		holdTimer = null;
		if (scrollRAF) cancelAnimationFrame(scrollRAF);
		scrollRAF = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('keydown', onKey);
	}

	function reset() {
		cleanup();
		active = false;
		indicator = null;
		ghost = null;
		draggedIds = [];
		grabDepth = 0;
		handleArmed = false;
		armedOnSelection = false;
	}

	// Depth of a block in the current visible list, or 0 if not found.
	function depthOf(blockId) {
		for (const { block, depth } of buildVisibleList(getBlocks())) {
			if (block.id === blockId) return depth;
		}
		return 0;
	}

	// Measure the visible rows (excluding dragged) in list-relative Y. Returns
	// { rows, originX } for resolveDrop. Shared by move + release.
	//
	// originX is grab-relative, NOT read from the DOM: the row box's left is the
	// same at every depth (indentation is padding), so it can't tell levels
	// apart. Instead we anchor the origin so that at the grab X the resolved
	// depth equals the grabbed row's own depth; moving one indent right/left then
	// nests/outdents by one. This behaves the same whether you grabbed the grip
	// or the text, and never auto-nests just because you grabbed further right.
	function measure() {
		const listEl = getListEl();
		const originX = startX - grabDepth * INDENT_PX;
		if (!listEl) return { rows: [], originX, listTop: 0 };
		const listTop = listEl.getBoundingClientRect().top;
		const draggedSet = new Set(draggedIds);
		const rows = [];
		for (const { block, depth, hasChildren } of buildVisibleList(getBlocks())) {
			if (draggedSet.has(block.id)) continue;
			const el = listEl.querySelector(`[data-block-id="${block.id}"]`);
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			rows.push({
				id: block.id,
				depth,
				hasChildren,
				top: rect.top - listTop,
				height: rect.height
			});
		}
		return { rows, originX, listTop };
	}

	// Called from a row's pointerdown. Arms the hold timer; a quick drag past
	// MOVE_CANCEL_PX before it fires means "select text / scroll", not "move".
	function armFromPointer(blockId, event) {
		if (event.button != null && event.button !== 0) return; // primary only
		const selected = getSelectedIds();
		const onSelection = selected.includes(blockId);
		// Dragging a live text selection (a word/phrase) is the browser's own
		// drag-and-drop of that text. Stay out of its way — don't hijack it into
		// a whole-block move. Block-selection drags clear the native range first,
		// so this only bails on an in-line text selection.
		if (!onSelection) {
			const textSel = window.getSelection?.();
			if (textSel && !textSel.isCollapsed && textSel.rangeCount > 0) return;
		}
		startX = event.clientX;
		startY = event.clientY;
		grabDepth = depthOf(blockId);
		const ids = onSelection ? selected : [blockId];
		draggedIds = orderedSelectionRoots(getBlocks(), ids);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		if (onSelection) {
			// Press landed on the existing multi-selection: grab it directly. No
			// long-press — activate on the first move like the grip — and never
			// preventDefault the press, so a plain click still lands a caret. A
			// release with no move is that click: onSelectionClick collapses the
			// selection so the caret can edit the line.
			handleArmed = true;
			armedOnSelection = true;
			return;
		}
		holdTimer = setTimeout(() => {
			holdTimer = null;
			active = true;
			ghost = { x: startX, y: startY, ids: draggedIds };
			if (navigator.vibrate) navigator.vibrate(8);
			window.getSelection()?.removeAllRanges();
			update(startX, startY);
		}, HOLD_MS);
	}

	// Called from a grip handle's pointerdown. No long-press: arm now, activate on
	// the first move. preventDefault keeps the press from stealing focus or
	// starting a text selection. The selection-aware id set matches armFromPointer.
	function armFromHandle(blockId, event) {
		if (event.button != null && event.button !== 0) return; // primary only
		event.preventDefault();
		startX = event.clientX;
		startY = event.clientY;
		grabDepth = depthOf(blockId);
		const selected = getSelectedIds();
		const ids = selected.includes(blockId) ? selected : [blockId];
		draggedIds = orderedSelectionRoots(getBlocks(), ids);
		handleArmed = true;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
	}

	function onMove(event) {
		if (!active) {
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (Math.hypot(dx, dy) <= MOVE_CANCEL_PX) return;
			if (handleArmed) {
				// First real move on a grip: go live now instead of cancelling.
				active = true;
				ghost = { x: event.clientX, y: event.clientY, ids: draggedIds };
				if (navigator.vibrate) navigator.vibrate(8);
				window.getSelection()?.removeAllRanges();
			} else {
				reset(); // quick drag before the long-press fired → select/scroll
				return;
			}
		}
		event.preventDefault();
		update(event.clientX, event.clientY);
		autoScroll(event.clientY);
	}

	function update(clientX, clientY) {
		const listEl = getListEl();
		if (!listEl) return;
		const { rows, originX, listTop } = measure();
		ghost = { x: clientX, y: clientY, ids: draggedIds };
		const target = resolveDrop(rows, clientX, clientY - listTop, originX, INDENT_PX);
		indicator = target ? { top: target.indicatorTop, depth: target.indicatorDepth } : null;
	}

	function autoScroll(clientY) {
		const listEl = getListEl();
		const scroller = listEl?.closest('[data-scroll-container]') ?? document.scrollingElement;
		if (!scroller) return;
		const rect =
			typeof scroller.getBoundingClientRect === 'function'
				? scroller.getBoundingClientRect()
				: { top: 0, bottom: window.innerHeight };
		let delta = 0;
		if (clientY < rect.top + AUTOSCROLL_EDGE_PX) delta = -AUTOSCROLL_SPEED;
		else if (clientY > rect.bottom - AUTOSCROLL_EDGE_PX) delta = AUTOSCROLL_SPEED;
		if (scrollRAF) cancelAnimationFrame(scrollRAF);
		scrollRAF = null;
		if (delta === 0) return;
		const step = () => {
			scroller.scrollBy(0, delta);
			scrollRAF = requestAnimationFrame(step);
		};
		scrollRAF = requestAnimationFrame(step);
	}

	function onUp(event) {
		if (!active) {
			const wasSelectionClick = armedOnSelection;
			reset();
			if (wasSelectionClick) onSelectionClick?.();
			return;
		}
		const { rows, originX, listTop } = measure();
		const target = resolveDrop(rows, event.clientX, event.clientY - listTop, originX, INDENT_PX);
		const ids = draggedIds;
		reset();
		if (!target) return;
		const plan = planDrop(getBlocks(), ids, target.newParentId, target.insertIndex);
		if (plan && plan.updates.length > 0) onApply(plan);
	}

	function onKey(event) {
		if (event.key === 'Escape') reset();
	}

	return {
		armFromPointer,
		armFromHandle,
		get active() {
			return active;
		},
		get indicator() {
			return indicator;
		},
		get ghost() {
			return ghost;
		},
		destroy: reset
	};
}
