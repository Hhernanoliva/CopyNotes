// Lossless internal clipboard format (spec 019, fix 5). Copying inside
// CopyNotes writes the real block structure (types, checked, code, nesting) to
// its own clipboard format so pasting back rebuilds the blocks exactly. Other
// apps ignore it and see normal text/HTML; external paste into CopyNotes has no
// payload and falls back to line parsing.
//
// The payload rides a "web custom format" (application/x-copynotes+json)
// instead of a hidden HTML marker, because the browser sanitises clipboard HTML
// and would strip a comment. Custom formats survive that sanitisation.

export const CLIPBOARD_FORMAT = 'web application/x-copynotes+json';

// A copy tree ({ block, children }) from format.buildCopyTree becomes an
// id-free node, the same shape snippet snapshots use so insertion can be reused,
// plus tag names (by block id) so tags survive a paste back into CopyNotes.
export function treeToNode(tree, tagsById = {}) {
	return {
		type: tree.block.type,
		content: tree.block.content ?? '',
		checked: tree.block.checked ?? false,
		note: tree.block.note ?? '',
		tags: (tagsById[tree.block.id] ?? []).map((tag) => tag.name),
		children: tree.children.map((child) => treeToNode(child, tagsById))
	};
}

// Nodes in pre-order — the same order planSnippetInsertion materialises blocks,
// so a paste can line each created block up with its source node (for tags).
export function flattenNode(node) {
	return [node, ...node.children.flatMap(flattenNode)];
}

// Serialise a forest of nodes to the string carried on the custom format.
export function serializeForest(forest) {
	return JSON.stringify(forest);
}

// Reliable same-browser fallback: the custom clipboard format is not delivered
// on every browser/paste path, so we also stash the payload in localStorage
// keyed by the exact plain text we copied. On paste, if the clipboard's plain
// text matches, we know it is our own content and use the rich payload. Guarded
// so it is a no-op server-side and never throws.
const STORE_KEY = 'copynotes:clipboard';

export function rememberCopy(text, payload) {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ text, payload }));
	} catch {
		// localStorage unavailable (SSR, privacy mode) — the custom format and
		// line parser still cover paste.
	}
}

export function recallCopy(text) {
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return null;
		const stored = JSON.parse(raw);
		return stored && stored.text === text ? stored.payload : null;
	} catch {
		return null;
	}
}

// Parse a clipboard payload back to a forest, or null when it is missing or not
// a non-empty CopyNotes forest.
export function deserializeForest(payload) {
	if (!payload) return null;
	try {
		const forest = JSON.parse(payload);
		return Array.isArray(forest) && forest.length ? forest : null;
	} catch {
		return null;
	}
}
