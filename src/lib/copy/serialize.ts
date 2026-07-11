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
// id-free node, the same shape snippet snapshots use so insertion can be reused.
export function treeToNode(tree) {
	return {
		type: tree.block.type,
		content: tree.block.content ?? '',
		checked: tree.block.checked ?? false,
		note: tree.block.note ?? '',
		children: tree.children.map(treeToNode)
	};
}

// Serialise a forest of nodes to the string carried on the custom format.
export function serializeForest(forest) {
	return JSON.stringify(forest);
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
