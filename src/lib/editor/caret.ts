// Cross-block caret helpers for arrow navigation (spec 019, fix 3). DOM-bound
// except edgeForDirection, which is pure and unit-tested. The editor owns the
// decision of *when* to cross a block edge; these helpers do the *how*.

// Up moves to the previous block's bottom line; down to the next block's top.
export function edgeForDirection(direction) {
	return direction < 0 ? 'bottom' : 'top';
}

// X pixel of the current collapsed caret, or null when there is no caret.
export function caretColumnX() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	const rects = range.getClientRects();
	const rect = rects.length ? rects[0] : range.getBoundingClientRect();
	return rect ? rect.left : null;
}

// Place the caret in `el` at horizontal pixel `x`, on its top or bottom line.
// Returns false when no point resolves (caller falls back to start/end).
export function placeCaretAtColumn(el, x, edge) {
	const box = el.getBoundingClientRect();
	const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
	const y = edge === 'top' ? box.top + lineHeight / 2 : box.bottom - lineHeight / 2;
	const clampedX = Math.min(Math.max(x, box.left + 1), box.right - 1);
	const point = caretPointFromXY(clampedX, y, el);
	if (!point) return false;
	const sel = window.getSelection();
	const range = document.createRange();
	range.setStart(point.node, point.offset);
	range.collapse(true);
	sel.removeAllRanges();
	sel.addRange(range);
	return true;
}

// Cross-browser caretPositionFromPoint / caretRangeFromPoint, restricted to el.
function caretPointFromXY(x, y, el) {
	if (document.caretPositionFromPoint) {
		const pos = document.caretPositionFromPoint(x, y);
		if (pos && el.contains(pos.offsetNode)) return { node: pos.offsetNode, offset: pos.offset };
	} else if (document.caretRangeFromPoint) {
		const range = document.caretRangeFromPoint(x, y);
		if (range && el.contains(range.startContainer))
			return { node: range.startContainer, offset: range.startOffset };
	}
	return null;
}
