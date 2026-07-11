import { normalizeUrl } from './url';

// Tag rename map for legacy → canonical.
const RENAME = { b: 'strong', i: 'em', strike: 's' };
// Tags kept as-is (canonical names).
const ALLOWED = new Set(['strong', 'em', 'u', 's', 'code', 'a', 'span', 'br']);
const COLOR_PREFIX = 'fmt-color-';

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
		const color = cls.split(/\s+/).find((c) => c.startsWith(COLOR_PREFIX));
		if (!color) {
			for (const child of Array.from(node.childNodes)) appendClean(child, target);
			return;
		}
		el.setAttribute('class', color);
	}

	for (const child of Array.from(node.childNodes)) appendClean(child, el);
	target.appendChild(el);
}

export function htmlToPlainText(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html ?? '';
	return holder.textContent ?? '';
}
