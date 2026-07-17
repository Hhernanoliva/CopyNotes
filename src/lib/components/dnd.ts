// Sidebar drag & drop (spec 022). dropTarget is pure geometry so it can be
// node-tested; sidebarDragList is a Svelte attachment that owns the pointer
// lifecycle. Mouse/pen lift after a 5px move; touch lifts after a 500ms
// long-press so plain swipes keep scrolling the list.

const MOUSE_THRESHOLD_PX = 5;
const TOUCH_CANCEL_PX = 10;
const LONG_PRESS_MS = 500;
const FOLDER_BAND = [0.3, 0.7];

function isRoot(row) {
	return row.isFolder || (row.folderId ?? null) === null;
}

// How many rows of a given container sit before the visual index `before`.
function containerIndexBefore(rows, before, container) {
	let index = 0;
	for (let i = 0; i < before; i++) {
		const row = rows[i];
		if (container === null) {
			if (isRoot(row)) index += 1;
		} else if (!row.isFolder && row.folderId === container) {
			index += 1;
		}
	}
	return index;
}

function childCount(rows, folderId) {
	return rows.filter((row) => !row.isFolder && row.folderId === folderId).length;
}

export function dropTarget(rows, pointerY) {
	// A folder's middle band means "file inside", and wins over gap math.
	for (const row of rows) {
		if (!row.isFolder) continue;
		const y = (pointerY - row.top) / row.height;
		if (y >= FOLDER_BAND[0] && y <= FOLDER_BAND[1]) {
			return { type: 'into-folder', folderId: row.id };
		}
	}
	// Otherwise find the insertion gap above the first row whose midline the
	// pointer has not yet crossed.
	for (let i = 0; i < rows.length; i++) {
		if (pointerY < rows[i].top + rows[i].height / 2) {
			const row = rows[i];
			if (!isRoot(row)) {
				// Gap sits above a folder child → inside that folder.
				return {
					type: 'insert',
					container: row.folderId,
					index: containerIndexBefore(rows, i, row.folderId)
				};
			}
			// Gap sits above a root row. If the previous row is a child of an
			// open folder, this gap is that folder's tail (drop after its last
			// child), otherwise it is a root gap.
			const prev = rows[i - 1];
			if (prev && !isRoot(prev)) {
				return { type: 'insert', container: prev.folderId, index: childCount(rows, prev.folderId) };
			}
			return { type: 'insert', container: null, index: containerIndexBefore(rows, i, null) };
		}
	}
	// Past every midline: append. A trailing folder child appends to its
	// folder; anything else appends to the root.
	const last = rows[rows.length - 1];
	if (last && !isRoot(last)) {
		return { type: 'insert', container: last.folderId, index: childCount(rows, last.folderId) };
	}
	return { type: 'insert', container: null, index: containerIndexBefore(rows, rows.length, null) };
}

export function sidebarDragList(getOptions) {
	return (node) => {
		let pressed = null; // { id, x, y, pointerId, pointerType }
		let dragging = null; // { id }
		let longPressTimer = null;
		let indicator = null;

		const rowEls = () => [...node.querySelectorAll('[data-drag-id]')];

		function measuredRows() {
			const listTop = node.getBoundingClientRect().top;
			return rowEls().map((el) => {
				const rect = el.getBoundingClientRect();
				return {
					id: el.dataset.dragId,
					top: rect.top - listTop,
					height: rect.height,
					folderId: el.dataset.dragFolderId || null,
					isFolder: el.dataset.dragIsFolder === 'true',
					isOpenFolder: el.dataset.dragOpenFolder === 'true',
					el
				};
			});
		}

		function ensureIndicator() {
			if (indicator) return indicator;
			indicator = document.createElement('div');
			indicator.style.cssText =
				'position:absolute;left:8px;right:8px;height:2px;border-radius:1px;' +
				'background:var(--ring);pointer-events:none;z-index:10;';
			node.style.position = 'relative';
			node.appendChild(indicator);
			return indicator;
		}

		function clearFeedback() {
			indicator?.remove();
			indicator = null;
			for (const el of rowEls()) {
				el.removeAttribute('data-drag-over-folder');
				el.removeAttribute('data-dragging');
			}
		}

		function startDrag(id) {
			dragging = { id };
			rowEls()
				.find((row) => row.dataset.dragId === id)
				?.setAttribute('data-dragging', 'true');
		}

		function stopDrag() {
			pressed = null;
			dragging = null;
			clearTimeout(longPressTimer);
			longPressTimer = null;
			clearFeedback();
		}

		function currentTarget(clientY) {
			const listTop = node.getBoundingClientRect().top;
			const rows = measuredRows();
			// The dragged row keeps its space; exclude it from geometry so the
			// gap math reflects the list as it will be after the move.
			return {
				rows,
				target: dropTarget(
					rows.filter((row) => row.id !== dragging.id),
					clientY - listTop
				)
			};
		}

		function gapRowFor(visible, target) {
			let count = 0;
			for (const row of visible) {
				const inContainer =
					target.container === null
						? row.isFolder || (row.folderId ?? null) === null
						: !row.isFolder && row.folderId === target.container;
				if (inContainer) {
					if (count === target.index) return row;
					count += 1;
				}
			}
			return null;
		}

		function showFeedback(clientY) {
			const { rows, target } = currentTarget(clientY);
			clearFeedback();
			rows.find((row) => row.id === dragging.id)?.el.setAttribute('data-dragging', 'true');
			if (target.type === 'into-folder') {
				rows.find((row) => row.id === target.folderId)?.el.setAttribute('data-drag-over-folder', 'true');
				return;
			}
			const visible = rows.filter((row) => row.id !== dragging.id);
			let y;
			if (visible.length === 0) y = 0;
			else {
				const gapRow = gapRowFor(visible, target);
				y = gapRow
					? gapRow.top
					: visible[visible.length - 1].top + visible[visible.length - 1].height;
			}
			ensureIndicator().style.top = `${y - 1}px`;
		}

		function onPointerDown(event) {
			if (event.button !== undefined && event.button !== 0) return;
			const rowEl = event.target.closest('[data-drag-id]');
			if (!rowEl || !node.contains(rowEl)) return;
			// Never hijack a rename input; a plain click still passes the
			// threshold check and works.
			if (event.target.closest('input, textarea')) return;
			pressed = {
				id: rowEl.dataset.dragId,
				x: event.clientX,
				y: event.clientY,
				pointerId: event.pointerId,
				pointerType: event.pointerType
			};
			if (event.pointerType === 'touch') {
				longPressTimer = setTimeout(() => {
					if (pressed) startDrag(pressed.id);
				}, LONG_PRESS_MS);
			}
		}

		function onPointerMove(event) {
			if (!pressed || event.pointerId !== pressed.pointerId) return;
			const distance = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
			if (!dragging) {
				if (pressed.pointerType === 'touch') {
					if (distance > TOUCH_CANCEL_PX) stopDrag(); // it's a scroll
					return;
				}
				if (distance < MOUSE_THRESHOLD_PX) return;
				startDrag(pressed.id);
			}
			event.preventDefault();
			showFeedback(event.clientY);
		}

		function onPointerUp(event) {
			if (!pressed || event.pointerId !== pressed.pointerId) return;
			if (!dragging) {
				stopDrag();
				return; // plain click — let it through
			}
			const { target } = currentTarget(event.clientY);
			const options = getOptions();
			const draggedId = dragging.id;
			stopDrag();
			if (
				target.type === 'into-folder' &&
				options.canDropInto &&
				!options.canDropInto(draggedId, target.folderId)
			) {
				return;
			}
			options.onDrop(draggedId, target);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape' && dragging) {
				event.stopPropagation();
				stopDrag();
			}
		}

		// Blocks native touch scrolling only while a drag is live.
		function onTouchMove(event) {
			if (dragging) event.preventDefault();
		}

		node.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', stopDrag);
		window.addEventListener('keydown', onKeyDown, true);
		node.addEventListener('touchmove', onTouchMove, { passive: false });

		return () => {
			stopDrag();
			node.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', stopDrag);
			window.removeEventListener('keydown', onKeyDown, true);
			node.removeEventListener('touchmove', onTouchMove);
		};
	};
}
