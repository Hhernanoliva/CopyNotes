// Copy formatters: blocks in, clipboard text out (specs/004). Pure logic so
// plain text, HTML, and future Markdown outputs stay testable without the editor.
// Collapsed state is visual only — descendants are always included.

import { sortByOrder } from '../blocks/ordering';
import { HEADING_LEVELS } from '../format/blocktype';

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

// A block's content can hold soft line breaks (Shift+Enter). Extra lines hang
// under the marker so "- uno\ndos" reads as a bullet with a continuation line.
function hangingLines(indent, marker, content) {
	const [first, ...rest] = content.split('\n');
	const pad = indent + ' '.repeat(marker.length);
	return [indent + marker + first, ...rest.map((line) => pad + line)];
}

function plainLines(node, depth) {
	const { block } = node;
	const indent = '  '.repeat(depth);
	let lines;
	if (block.type === 'separator') lines = [indent + '---'];
	else if (block.type === 'bullet') lines = hangingLines(indent, '- ', block.content);
	else if (block.type === 'todo') lines = hangingLines(indent, `- ${todoMark(block)} `, block.content);
	else if (HEADING_LEVELS[block.type])
		lines = hangingLines(indent, '#'.repeat(HEADING_LEVELS[block.type]) + ' ', block.content);
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

// Soft line breaks inside content become <br> so pasted HTML keeps them.
function inlineHtml(content) {
	return content.split('\n').map(escapeHtml).join('<br>');
}

function htmlContent(block) {
	if (block.type === 'separator') return '<hr>';
	const level = HEADING_LEVELS[block.type];
	if (level) return `<h${level}>` + inlineHtml(block.content) + `</h${level}>` + noteHtml(block);
	if (block.type === 'code') return '<pre><code>' + escapeHtml(block.content) + '</code></pre>' + noteHtml(block);
	if (block.type === 'todo') return todoMark(block) + ' ' + inlineHtml(block.content) + noteHtml(block);
	return inlineHtml(block.content) + noteHtml(block);
}

function htmlNode(node) {
	return '<li>' + htmlContent(node.block) + htmlChildren(node) + '</li>';
}

export function formatHtml(tree) {
	const { block } = tree;
	// A lone text/code/separator block pastes as its natural element, not a list.
	if (tree.children.length === 0 && block.type !== 'bullet' && block.type !== 'todo') {
		if (block.type === 'text') return '<p>' + inlineHtml(block.content) + noteHtml(block) + '</p>';
		return htmlContent(block);
	}
	return '<ul>' + htmlNode(tree) + '</ul>';
}
