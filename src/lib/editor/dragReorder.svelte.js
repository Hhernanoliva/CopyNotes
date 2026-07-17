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

export function createDragReorder({ getBlocks, getSelectedIds, getListEl, onApply }) {
	let active = $state(false);
	let indicator = $state(null); // { top, depth } — top is list-relative px
	let ghost = $state(null); // { x, y, ids } — x/y are viewport px (position: fixed)

	let holdTimer = null;
	let startX = 0;
	let startY = 0;
	let draggedIds = [];
	let scrollRAF = null;

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
	}

	// Measure the visible rows (excluding dragged) in list-relative Y. Returns
	// { rows, originX } for resolveDrop. Shared by move + release.
	function measure() {
		const listEl = getListEl();
		if (!listEl) return { rows: [], originX: 0 };
		const listTop = listEl.getBoundingClientRect().top;
		const draggedSet = new Set(draggedIds);
		const rows = [];
		let originX = Infinity;
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
			originX = Math.min(originX, rect.left - depth * INDENT_PX);
		}
		if (!Number.isFinite(originX)) originX = 0;
		return { rows, originX, listTop };
	}

	// Called from a row's pointerdown. Arms the hold timer; a quick drag past
	// MOVE_CANCEL_PX before it fires means "select text / scroll", not "move".
	function armFromPointer(blockId, event) {
		if (event.button != null && event.button !== 0) return; // primary only
		startX = event.clientX;
		startY = event.clientY;
		const selected = getSelectedIds();
		const ids = selected.includes(blockId) ? selected : [blockId];
		draggedIds = orderedSelectionRoots(getBlocks(), ids);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		holdTimer = setTimeout(() => {
			holdTimer = null;
			active = true;
			ghost = { x: startX, y: startY, ids: draggedIds };
			if (navigator.vibrate) navigator.vibrate(8);
			window.getSelection()?.removeAllRanges();
			update(startX, startY);
		}, HOLD_MS);
	}

	function onMove(event) {
		if (!active) {
			const dx = event.clientX - startX;
			const dy = event.clientY - startY;
			if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) reset(); // cancel arming
			return;
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
			reset();
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
