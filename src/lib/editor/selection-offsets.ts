// Pure helpers to convert between a DOM Range boundary (node, offset) and a
// plain character offset counted from the start of a root element's text
// content. Used to save/restore a contenteditable selection across a DOM
// rewrite (e.g. sanitizing/re-applying innerHTML), where node identity does
// not survive but character position does.
//
// A Range boundary's `node` can be either a Text node (offset = character
// index within that node, as usual) or an Element (offset = an index into
// that element's childNodes — the caret sits "before child[offset]", or at
// the very end when offset === childNodes.length). Browsers hand back
// element-anchored boundaries for things like select-all or triple-click, so
// both shapes have to be handled or the caret snaps to the end of the block.

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function totalTextLength(root) {
	if (!root) return 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let total = 0;
	let node;
	while ((node = walker.nextNode())) total += node.textContent.length;
	return total;
}

// Character offset (from the start of root) of a Text-node boundary: sum the
// length of every text node that precedes `node` in document order, plus the
// local offset within it.
function textNodeOffset(root, node, offset) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let sum = 0;
	let current;
	while ((current = walker.nextNode())) {
		if (current === node) return sum + offset;
		sum += current.textContent.length;
	}
	// node isn't under root (shouldn't happen with real selections) — best
	// effort: treat it as already past everything we saw.
	return sum + offset;
}

// Character offset of an Element-anchored boundary: the caret sits right
// before `node.childNodes[offset]` (or at the end of `node` when offset
// equals the child count). Count every text node under root that comes
// strictly before that point.
function elementBoundaryOffset(root, node, offset) {
	const children = node.childNodes;
	const boundaryChild = offset < children.length ? children[offset] : null;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let sum = 0;
	let current;
	while ((current = walker.nextNode())) {
		if (boundaryChild) {
			if (current === boundaryChild) break;
			const rel = boundaryChild.compareDocumentPosition(current);
			// FOLLOWING is set both when `current` comes after boundaryChild as a
			// sibling and when it is a descendant of it — either way that's at or
			// past the boundary, so stop without counting it.
			if (rel & Node.DOCUMENT_POSITION_FOLLOWING) break;
			sum += current.textContent.length;
		} else {
			// offset === child count: boundary is at the end of `node`'s children.
			// Anything inside node counts; anything after node in the tree does not.
			if (node.contains(current)) {
				sum += current.textContent.length;
				continue;
			}
			const rel = node.compareDocumentPosition(current);
			if (rel & Node.DOCUMENT_POSITION_FOLLOWING) break;
			sum += current.textContent.length;
		}
	}
	return sum;
}

// Count characters from the start of `root`'s text content up to the Range
// boundary (node, offset), so a selection can be re-anchored by character
// position instead of by node identity (nodes may get replaced later).
export function textOffset(root, node, offset) {
	if (!root || !node) return 0;
	const total = totalTextLength(root);
	try {
		if (node.nodeType === 3) return clamp(textNodeOffset(root, node, offset), 0, total);
		if (node.nodeType === 1) return clamp(elementBoundaryOffset(root, node, offset), 0, total);
	} catch {
		return clamp(total, 0, total);
	}
	return clamp(total, 0, total);
}

// Locate the (node, localOffset) for a target character count within
// `textNodes`. At an exact boundary between two text nodes, 'start' prefers
// the start of the next node and 'end' prefers the end of the previous node
// (matching how browsers normally report adjacent-node selections).
function locate(textNodes, target, mode) {
	if (target <= 0) return { node: textNodes[0], offset: 0 };
	let cumulative = 0;
	for (let i = 0; i < textNodes.length; i++) {
		const node = textNodes[i];
		const len = node.textContent.length;
		const nextCumulative = cumulative + len;
		if (mode === 'start') {
			if (target < nextCumulative || (target === nextCumulative && i === textNodes.length - 1)) {
				return { node, offset: target - cumulative };
			}
		} else if (target <= nextCumulative && target > cumulative) {
			return { node, offset: target - cumulative };
		}
		cumulative = nextCumulative;
	}
	const last = textNodes[textNodes.length - 1];
	return { node: last, offset: last.textContent.length };
}

// ── Plain-text variants: <br> counts as one character ──────────────────────
// htmlToPlainText turns <br> into "\n", so offsets into a block's plain
// `content` only line up with the DOM when soft line breaks are counted too.
// These variants mirror textOffset/rangeFromTextOffsets under that rule; the
// slash menu uses them to anchor "/" and to park the caret after a command.

// Text nodes and <br> elements of root, in document order, each with the
// number of plain-text characters it contributes.
function plainUnits(root) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
	const units = [];
	let node;
	while ((node = walker.nextNode())) {
		if (node.nodeType === 3) units.push({ node, length: node.textContent.length, isText: true });
		else if (node.tagName === 'BR') units.push({ node, length: 1, isText: false });
	}
	return units;
}

export function plainTextOffset(root, node, offset) {
	if (!root || !node) return 0;
	const units = plainUnits(root);
	const total = units.reduce((sum, unit) => sum + unit.length, 0);
	try {
		if (node.nodeType === 3) {
			let sum = 0;
			for (const unit of units) {
				if (unit.node === node) return clamp(sum + offset, 0, total);
				sum += unit.length;
			}
			return clamp(sum + offset, 0, total);
		}
		if (node.nodeType === 1) {
			// Element-anchored boundary: caret sits before childNodes[offset], or at
			// the end of `node` when offset === childNodes.length (see textOffset).
			const children = node.childNodes;
			const boundaryChild = offset < children.length ? children[offset] : null;
			let sum = 0;
			for (const unit of units) {
				if (boundaryChild) {
					if (unit.node === boundaryChild) break;
					if (boundaryChild.compareDocumentPosition(unit.node) & Node.DOCUMENT_POSITION_FOLLOWING)
						break;
					sum += unit.length;
				} else {
					if (node.contains(unit.node)) {
						sum += unit.length;
						continue;
					}
					if (node.compareDocumentPosition(unit.node) & Node.DOCUMENT_POSITION_FOLLOWING) break;
					sum += unit.length;
				}
			}
			return clamp(sum, 0, total);
		}
	} catch {
		return clamp(total, 0, total);
	}
	return clamp(total, 0, total);
}

// Collapsed Range at a plain-text offset (br-aware). Never throws — falls
// back to a range collapsed at the start of root.
export function rangeAtPlainOffset(root, target) {
	const range = document.createRange();
	if (!root) return range;
	try {
		const units = plainUnits(root);
		if (units.length === 0) {
			range.selectNodeContents(root);
			range.collapse(true);
			return range;
		}
		const total = units.reduce((sum, unit) => sum + unit.length, 0);
		let remaining = clamp(target, 0, total);
		for (const unit of units) {
			if (remaining <= unit.length) {
				if (unit.isText) range.setStart(unit.node, remaining);
				else if (remaining === 0) range.setStartBefore(unit.node);
				else range.setStartAfter(unit.node);
				range.collapse(true);
				return range;
			}
			remaining -= unit.length;
		}
		range.selectNodeContents(root);
		range.collapse(false);
		return range;
	} catch {
		try {
			range.selectNodeContents(root);
			range.collapse(true);
		} catch {
			// root itself unusable; return the collapsed range as-is.
		}
		return range;
	}
}

// Inverse of textOffset: walk root's text nodes to build a Range spanning
// [startOffset, endOffset) characters. Never throws — falls back to a range
// collapsed inside root when the DOM can't satisfy the request.
export function rangeFromTextOffsets(root, startOffset, endOffset) {
	const range = document.createRange();
	if (!root) return range;
	try {
		const textNodes = [];
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) textNodes.push(node);

		if (textNodes.length === 0) {
			range.selectNodeContents(root);
			range.collapse(true);
			return range;
		}

		const total = textNodes.reduce((sum, n) => sum + n.textContent.length, 0);
		const start = clamp(startOffset, 0, total);
		const end = clamp(endOffset, 0, total);
		const startPoint = locate(textNodes, start, 'start');
		const endPoint = locate(textNodes, Math.max(start, end), 'end');

		range.setStart(startPoint.node, startPoint.offset);
		range.setEnd(endPoint.node, endPoint.offset);
		return range;
	} catch {
		try {
			range.selectNodeContents(root);
			range.collapse(true);
		} catch {
			// root itself unusable; return whatever range we have (collapsed at 0,0).
		}
		return range;
	}
}
