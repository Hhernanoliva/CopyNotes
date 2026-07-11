// Copy formatters: blocks in, clipboard text out (specs/004). Pure logic so
// plain text, HTML, and future Markdown outputs stay testable without the editor.
// Collapsed state is visual only — descendants are always included.

import { sortByOrder } from '../blocks/ordering';

export function buildCopyTree(blocks, rootId, withChildren) {
	const root = blocks.find((block) => block.id === rootId);
	function children(parentId) {
		if (!withChildren) return [];
		return sortByOrder(blocks.filter((block) => block.parentBlockId === parentId)).map(
			(block) => ({ block, children: children(block.id) })
		);
	}
	return { block: root, children: withChildren ? children(rootId) : [] };
}

function todoMark(block) {
	return block.checked ? '[x]' : '[ ]';
}

function plainLines(node, depth) {
	const { block } = node;
	const indent = '  '.repeat(depth);
	let lines;
	if (block.type === 'separator') lines = [indent + '---'];
	else if (block.type === 'bullet') lines = [indent + '- ' + block.content];
	else if (block.type === 'todo') lines = [`${indent}- ${todoMark(block)} ${block.content}`];
	else lines = block.content.split('\n').map((line) => indent + line);
	// The secondary note sits one indent deeper, right under the block.
	if (block.note) lines = lines.concat(block.note.split('\n').map((line) => indent + '  ' + line));
	for (const child of node.children) lines = lines.concat(plainLines(child, depth + 1));
	return lines;
}

export function formatPlainText(tree) {
	return plainLines(tree, 0).join('\n');
}

function escapeHtml(text) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function htmlChildren(node) {
	if (node.children.length === 0) return '';
	return '<ul>' + node.children.map(htmlNode).join('') + '</ul>';
}

function noteHtml(block) {
	if (!block.note) return '';
	return '<br>' + block.note.split('\n').map(escapeHtml).join('<br>');
}

function htmlContent(block) {
	if (block.type === 'separator') return '<hr>';
	if (block.type === 'code') return '<pre><code>' + escapeHtml(block.content) + '</code></pre>' + noteHtml(block);
	if (block.type === 'todo') return todoMark(block) + ' ' + escapeHtml(block.content) + noteHtml(block);
	return escapeHtml(block.content) + noteHtml(block);
}

function htmlNode(node) {
	return '<li>' + htmlContent(node.block) + htmlChildren(node) + '</li>';
}

export function formatHtml(tree) {
	const { block } = tree;
	// A lone text/code/separator block pastes as its natural element, not a list.
	if (tree.children.length === 0 && block.type !== 'bullet' && block.type !== 'todo') {
		if (block.type === 'text') return '<p>' + escapeHtml(block.content) + noteHtml(block) + '</p>';
		return htmlContent(block);
	}
	return '<ul>' + htmlNode(tree) + '</ul>';
}
