// Pure HTML-transform layer for drag-to-move of selected text (spec 026). No
// pointer or component code lives here: given plain-text offsets and the source/
// target html, it produces the moved html and where the caret should land. The
// drag controller measures the DOM; this file only rewrites html, mirroring the
// br-aware counting of removePlainTextRange in format/sanitize.ts.

import { sanitizeHtml, removePlainTextRange } from '$lib/format';
import { rangeAtPlainOffset } from './selection-offsets';

// The html of the plain-text range [start, end), formatting preserved.
export function sliceHtmlByPlainRange(html, start, end) {
	if (!html || end <= start) return '';
	const holder = document.createElement('div');
	holder.innerHTML = sanitizeHtml(html);
	const from = rangeAtPlainOffset(holder, start);
	const to = rangeAtPlainOffset(holder, end);
	const range = document.createRange();
	range.setStart(from.startContainer, from.startOffset);
	range.setEnd(to.startContainer, to.startOffset);
	const tmp = document.createElement('div');
	tmp.appendChild(range.cloneContents());
	return sanitizeHtml(tmp.innerHTML);
}

// Insert a fragment of html at a plain-text offset, formatting preserved.
export function insertHtmlAtPlainOffset(html, offset, fragmentHtml) {
	const holder = document.createElement('div');
	holder.innerHTML = sanitizeHtml(html ?? '');
	const at = rangeAtPlainOffset(holder, offset);
	const range = document.createRange();
	range.setStart(at.startContainer, at.startOffset);
	range.collapse(true);
	const parsed = document.createElement('div');
	parsed.innerHTML = sanitizeHtml(fragmentHtml ?? '');
	const frag = document.createDocumentFragment();
	while (parsed.firstChild) frag.appendChild(parsed.firstChild);
	range.insertNode(frag);
	holder.normalize(); // merge the text nodes the split created
	return sanitizeHtml(holder.innerHTML);
}

// Plan a move of the plain-text range [start, end) of sourceHtml to dropOffset
// in targetHtml. Returns { sourceHtml, targetHtml, caretOffset } (for a same-
// block move both html strings are the single resulting block), or null when the
// move is empty or drops back inside the moved run.
export function planTextMove({ sourceHtml, start, end, targetHtml, dropOffset, sameBlock }) {
	if (end <= start) return null;
	const fragment = sliceHtmlByPlainRange(sourceHtml, start, end);
	if (fragment === '') return null;
	const movedLen = end - start;

	if (sameBlock) {
		// Dropping anywhere within the selection itself changes nothing.
		if (dropOffset >= start && dropOffset <= end) return null;
		const removed = removePlainTextRange(sourceHtml, start, end);
		// After removal, offsets past the cut shift left by the removed length.
		const adjusted = dropOffset > end ? dropOffset - movedLen : dropOffset;
		const finalHtml = insertHtmlAtPlainOffset(removed, adjusted, fragment);
		return { sourceHtml: finalHtml, targetHtml: finalHtml, caretOffset: adjusted + movedLen };
	}

	const newSource = removePlainTextRange(sourceHtml, start, end);
	const newTarget = insertHtmlAtPlainOffset(targetHtml, dropOffset, fragment);
	return { sourceHtml: newSource, targetHtml: newTarget, caretOffset: dropOffset + movedLen };
}
