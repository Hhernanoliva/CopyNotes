// Snippet snapshots (specs/005). A snapshot copies a block subtree into an
// id-free structure so the snippet stays alive and unchanged even if the
// source blocks are edited or deleted. Template features can later transform
// a snapshot before insertion without touching storage or the editor.

import { sortByOrder } from '../blocks/ordering';
import { buildCopyTree, formatPlainText } from '../copy/format';

const NAME_MAX = 60;
const FALLBACK_NAME = 'Snippet';

function deriveName(text) {
	const firstLine = (text ?? '').split('\n')[0].trim();
	if (!firstLine) return FALLBACK_NAME;
	return firstLine.slice(0, NAME_MAX);
}

export function snapshotFromBlocks(blocks, rootId) {
	const root = blocks.find((block) => block.id === rootId);
	function node(block) {
		const children = sortByOrder(
			blocks.filter((candidate) => candidate.parentBlockId === block.id)
		);
		return {
			type: block.type,
			content: block.content,
			html: block.html ?? '',
			checked: block.checked,
			note: block.note ?? '',
			children: children.map(node)
		};
	}
	return node(root);
}

// Everything createSnippet needs when saving a block (with children) as a
// snippet. `content` is the plain-text rendering so snippets stay searchable
// and usable even without their structured snapshot.
export function snippetFieldsFromBlocks(blocks, rootId, noteId) {
	const root = blocks.find((block) => block.id === rootId);
	const snapshot = snapshotFromBlocks(blocks, rootId);
	return {
		name: deriveName(root.content),
		content: formatPlainText(buildCopyTree(blocks, rootId, true)),
		blockSnapshot: snapshot,
		sourceNoteId: noteId,
		sourceBlockId: rootId
	};
}

export function snippetFieldsFromText(text) {
	const trimmed = (text ?? '').trim();
	return {
		name: deriveName(trimmed),
		content: trimmed,
		blockSnapshot: null
	};
}
