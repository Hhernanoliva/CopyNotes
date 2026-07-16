import { normalizeUrl } from './url';
import { TEXT_COLORS } from './colors';

// ── CONTRACT: the inline-format allow-list ─────────────────────────────────
// This file is the single definition of what inline HTML CopyNotes accepts.
// Every write boundary (editing, internal paste, backup import, snippet
// insertion via format/ingest.ts) and the render sink funnel through
// sanitizeHtml. When adding a NEW inline format, update ALL of:
//   1. RENAME / ALLOWED below (and attribute handling in appendClean)
//   2. TEXT_COLORS in colors.ts if it is a new color
//   3. htmlInlineToMarkdown in inline-markdown.ts (Markdown export/copy)
//   4. the toolbar/commands in format/commands.ts
// Anything not listed here is silently unwrapped to its text content — text
// is never lost, only the unknown decoration.
// ────────────────────────────────────────────────────────────────────────────

// Tag rename map for legacy → canonical.
const RENAME = { b: 'strong', i: 'em', strike: 's' };
// Tags kept as-is (canonical names).
const ALLOWED = new Set(['strong', 'em', 'u', 's', 'code', 'a', 'span', 'br']);
// Only the approved palette, not any fmt-color-* string.
const COLOR_CLASSES = new Set(
	TEXT_COLORS.map((color) => color.className).filter(Boolean)
);

// Sanitize a dirty HTML string down to CopyNotes' inline subset. Anything not
// on the allow-list is unwrapped to its text content. Runs in the browser and
// in jsdom (both provide DOMParser).
export function sanitizeHtml(dirty) {
	const doc = new DOMParser().parseFromString(`<body>${dirty ?? ''}</body>`, 'text/html');
	const clean = document.createDocumentFragment();
	for (const node of Array.from(doc.body.childNodes)) {
		appendClean(node, clean);
	}
	const holder = document.createElement('div');
	holder.appendChild(clean);
	return holder.innerHTML;
}

function appendClean(node, target) {
	if (node.nodeType === Node.TEXT_NODE) {
		target.appendChild(document.createTextNode(node.textContent));
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const raw = node.tagName.toLowerCase();
	const tag = RENAME[raw] ?? raw;

	if (!ALLOWED.has(tag)) {
		// Unwrap: keep the children, drop the element.
		for (const child of Array.from(node.childNodes)) appendClean(child, target);
		return;
	}

	if (tag === 'br') {
		target.appendChild(document.createElement('br'));
		return;
	}

	const el = document.createElement(tag);

	if (tag === 'a') {
		const href = normalizeUrl(node.getAttribute('href'));
		if (!href) {
			// Invalid/unsafe link: keep the text, drop the anchor.
			for (const child of Array.from(node.childNodes)) appendClean(child, target);
			return;
		}
		el.setAttribute('href', href);
		el.setAttribute('target', '_blank');
		el.setAttribute('rel', 'noopener noreferrer');
	} else if (tag === 'span') {
		const cls = node.getAttribute('class') ?? '';
		const color = cls.split(/\s+/).find((c) => COLOR_CLASSES.has(c));
		if (!color) {
			for (const child of Array.from(node.childNodes)) appendClean(child, target);
			return;
		}
		el.setAttribute('class', color);
	}

	for (const child of Array.from(node.childNodes)) appendClean(child, el);
	target.appendChild(el);
}

// Inverse of plainTextToHtml: <br> is a soft line break, so it must come back
// as \n or search, copy, and export silently lose the break the user sees.
export function htmlToPlainText(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html ?? '';
	for (const br of Array.from(holder.querySelectorAll('br'))) {
		br.replaceWith(document.createTextNode('\n'));
	}
	return holder.textContent ?? '';
}

// Escape plain text into safe HTML for the innerHTML render sink. Literal
// markup a user typed (or pasted as plain text) becomes visible text, never
// executable nodes. Newlines become <br> to preserve soft line breaks.
export function plainTextToHtml(text) {
	const escaped = (text ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
	return escaped.split('\n').join('<br>');
}
