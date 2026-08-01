import { normalizeUrl } from './url';

const EXEC = { bold: 'bold', italic: 'italic', underline: 'underline', strikethrough: 'strikeThrough' };

// Toggle a basic inline mark on the current selection. execCommand is a toggle,
// so apply/remove share one path; the toolbar reads active state separately.
export function applyInline(kind) {
	const command = EXEC[kind];
	if (command) document.execCommand(command, false);
}

export function removeInline(kind) {
	applyInline(kind);
}

// Toggle inline code by wrapping/unwrapping the selection in a <code> element.
export function toggleCode() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
	const range = sel.getRangeAt(0);
	const existing = ancestorTag(range.commonAncestorContainer, 'code');
	if (existing) {
		unwrap(existing);
		return;
	}
	const code = document.createElement('code');
	code.appendChild(range.extractContents());
	range.insertNode(code);
	selectNode(code);
}

// Apply or clear a color span. Passing null removes any color span in range.
export function applyColor(className) {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
	const range = sel.getRangeAt(0);
	const existing = ancestorSpanClass(range.commonAncestorContainer, 'fmt-color-');
	if (existing) stripClass(existing, 'fmt-color-');
	if (!className) return;
	const span = document.createElement('span');
	span.className = className;
	span.appendChild(range.extractContents());
	range.insertNode(span);
	selectNode(span);
}

// Apply, replace or clear an inline size span (spec 032). Passing null removes
// any size span in range; passing the class already in force removes it too, so
// pressing the same button twice leaves nothing behind.
export function applySize(className) {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
	const range = sel.getRangeAt(0);
	const existing = ancestorSpanClass(range.commonAncestorContainer, 'fmt-size-');
	const alreadyThisSize = !!className && existing?.classList.contains(className);
	if (existing) stripClass(existing, 'fmt-size-');
	if (!className || alreadyThisSize) return;
	const span = document.createElement('span');
	span.className = className;
	span.appendChild(range.extractContents());
	range.insertNode(span);
	selectNode(span);
}

// Wrap the selection in an anchor. Returns false when the URL is invalid.
export function applyLink(rawUrl) {
	const href = normalizeUrl(rawUrl);
	if (!href) return false;
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
	const range = sel.getRangeAt(0);
	const existing = ancestorTag(range.commonAncestorContainer, 'a');
	if (existing) {
		existing.setAttribute('href', href);
		existing.setAttribute('target', '_blank');
		existing.setAttribute('rel', 'noopener noreferrer');
		return true;
	}
	const a = document.createElement('a');
	a.setAttribute('href', href);
	a.setAttribute('target', '_blank');
	a.setAttribute('rel', 'noopener noreferrer');
	a.appendChild(range.extractContents());
	range.insertNode(a);
	selectNode(a);
	return true;
}

export function removeLink() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return;
	const anchor = ancestorTag(sel.getRangeAt(0).commonAncestorContainer, 'a');
	if (anchor) unwrap(anchor);
}

// --- helpers ---
function ancestorTag(node, tag) {
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el.classList !== undefined && !el.classList.contains('block-editable')) {
		if (el.tagName?.toLowerCase() === tag) return el;
		el = el.parentNode;
	}
	return null;
}

// The nearest enclosing span carrying a class of this family (fmt-color-,
// fmt-size-), stopping at the row's editable box.
function ancestorSpanClass(node, prefix) {
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el.classList !== undefined && !el.classList.contains('block-editable')) {
		if (el.tagName?.toLowerCase() === 'span' &&
			[...el.classList].some((c) => c.startsWith(prefix))) return el;
		el = el.parentNode;
	}
	return null;
}

// Drop one family of classes from a span, and the span itself once nothing is
// left. Removing the family instead of unwrapping outright matters because a
// single span can carry a color *and* a size: recoloring text must not silently
// undo its size, or the other way round.
function stripClass(el, prefix) {
	for (const cls of [...el.classList]) {
		if (cls.startsWith(prefix)) el.classList.remove(cls);
	}
	if (el.classList.length === 0) unwrap(el);
}

function unwrap(el) {
	const parent = el.parentNode;
	while (el.firstChild) parent.insertBefore(el.firstChild, el);
	parent.removeChild(el);
}

function selectNode(node) {
	const sel = window.getSelection();
	const range = document.createRange();
	range.selectNodeContents(node);
	sel.removeAllRanges();
	sel.addRange(range);
}
