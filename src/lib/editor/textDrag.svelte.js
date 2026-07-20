// Custom drag-to-move for a text selection (spec 026). Native contenteditable
// DnD is unreliable — a quick grab re-selects and collapses the selection — so
// we own the gesture. Armed from a pointerdown inside a live selection; on the
// first move past a small threshold it activates, suppresses the browser's own
// re-select, and tracks a drop caret. On release it hands the resolved target to
// the editor, which performs the pure planTextMove and persists it.
//
// This controller is DOM-light: mapping a screen point to a { blockId, offset,
// caretRect } is injected as resolveDropPoint so the editor owns block
// eligibility (code/separators excluded) and offset math stays testable.

const THRESHOLD_PX = 5;

export function createTextDrag({ resolveDropPoint, onApply }) {
	let active = $state(false);
	let indicator = $state(null); // { x, top, height } viewport coords for the caret line

	let source = null; // { id, start, end }
	let startX = 0;
	let startY = 0;

	function suppressSelect(event) {
		event.preventDefault();
	}

	function cleanup() {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('keydown', onKey);
		document.removeEventListener('selectstart', suppressSelect);
	}

	function reset() {
		cleanup();
		active = false;
		indicator = null;
		source = null;
	}

	// Called from a block's mousedown when the press landed inside a live text
	// selection [start, end) within that rich block.
	function armFromSelection(sourceId, start, end, event) {
		if (event.button != null && event.button !== 0) return; // primary only
		source = { id: sourceId, start, end };
		startX = event.clientX;
		startY = event.clientY;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
	}

	function onMove(event) {
		if (!active) {
			if (Math.hypot(event.clientX - startX, event.clientY - startY) <= THRESHOLD_PX) return;
			active = true;
			// Stop the browser from starting its own selection while we drag.
			document.addEventListener('selectstart', suppressSelect);
		}
		event.preventDefault();
		const point = resolveDropPoint(event.clientX, event.clientY);
		indicator = point
			? { x: point.caretRect.left, top: point.caretRect.top, height: point.caretRect.height }
			: null;
	}

	function onUp(event) {
		if (!active) {
			reset();
			return;
		}
		const point = resolveDropPoint(event.clientX, event.clientY);
		const src = source;
		reset();
		if (!point || !src) return;
		onApply({
			sourceId: src.id,
			start: src.start,
			end: src.end,
			targetId: point.blockId,
			offset: point.offset
		});
	}

	function onKey(event) {
		if (event.key === 'Escape') reset();
	}

	return {
		armFromSelection,
		get active() {
			return active;
		},
		get indicator() {
			return indicator;
		},
		destroy: reset
	};
}
