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
	const existing = ancestorSpanColor(range.commonAncestorContainer);
	if (existing) unwrap(existing);
	if (!className) return;
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

function ancestorSpanColor(node) {
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el.classList !== undefined && !el.classList.contains('block-editable')) {
		if (el.tagName?.toLowerCase() === 'span' &&
			[...el.classList].some((c) => c.startsWith('fmt-color-'))) return el;
		el = el.parentNode;
	}
	return null;
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
