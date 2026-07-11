// Snippet insertion plan (specs/005). Turns a saved snippet back into normal
// blocks in the target note: the snapshot root lands as a sibling right after
// the focused block, descendants get fresh ids so the inserted copy is fully
// independent. Pure logic — the editor applies the plan through storage.

import { planInsertAfter, sortByOrder } from '../blocks/ordering';

export function planSnippetInsertion(blocks, snippet, options) {
	const { noteId, afterId = null, createId } = options;
	const after = afterId ? blocks.find((block) => block.id === afterId) : undefined;
	const parentBlockId = after ? (after.parentBlockId ?? null) : null;
	const siblings = sortByOrder(
		blocks.filter((block) => (block.parentBlockId ?? null) === parentBlockId)
	);
	const { order, updates } = after
		? planInsertAfter(siblings, after.id)
		: { order: siblings.length, updates: [] };

	const rootNode = snippet.blockSnapshot ?? {
		type: 'text',
		content: snippet.content,
		html: snippet.html ?? snippet.content,
		checked: false,
		children: []
	};

	const newBlocks = [];
	function materialize(node, parentId, nodeOrder) {
		const id = createId();
		newBlocks.push({
			id,
			noteId,
			parentBlockId: parentId,
			type: node.type,
			content: node.content,
			html: node.html ?? node.content,
			order: nodeOrder,
			collapsed: false,
			checked: node.checked ?? false,
			note: node.note ?? ''
		});
		node.children.forEach((child, index) => materialize(child, id, index));
	}
	materialize(rootNode, parentBlockId, order);

	return { newBlocks, updates, focusId: newBlocks[0].id };
}
