// Whole-note Markdown/HTML export (specs/007). These are reading/sharing
// formats: soft-deleted blocks must already be filtered out by the caller
// (the repositories do that), unlike the JSON backup which keeps everything.
// Collapsed state is visual only — children always export.

import { sortByOrder } from '../blocks/ordering';

function buildForest(blocks) {
	function children(parentId) {
		return sortByOrder(blocks.filter((block) => block.parentBlockId === parentId)).map(
			(block) => ({ block, children: children(block.id) })
		);
	}
	return children(null);
}

function todoMark(block) {
	return block.checked ? '[x]' : '[ ]';
}

// --- Markdown ---

function markdownListLines(node, depth) {
	const { block } = node;
	const indent = '  '.repeat(depth);
	let lines;
	if (block.type === 'bullet') lines = [indent + '- ' + block.content];
	else if (block.type === 'todo') lines = [`${indent}- ${todoMark(block)} ${block.content}`];
	else if (block.type === 'separator') lines = [indent + '---'];
	else lines = block.content.split('\n').map((line) => indent + line);
	for (const child of node.children) lines = lines.concat(markdownListLines(child, depth + 1));
	return lines;
}

function markdownRootChunk(node) {
	const { block } = node;
	if (block.type === 'bullet' || block.type === 'todo') return markdownListLines(node, 0).join('\n');
	let lines;
	if (block.type === 'separator') lines = ['---'];
	else if (block.type === 'code') lines = ['```', block.content, '```'];
	else lines = [block.content];
	for (const child of node.children) lines = lines.concat(markdownListLines(child, 1));
	return lines.join('\n');
}

export function noteToMarkdown(note, blocks) {
	const forest = buildForest(blocks);
	const chunks = [];
	let list = [];
	for (const node of forest) {
		const isListItem = node.block.type === 'bullet' || node.block.type === 'todo';
		if (isListItem) {
			list.push(markdownRootChunk(node));
		} else {
			if (list.length > 0) chunks.push(list.join('\n'));
			list = [];
			chunks.push(markdownRootChunk(node));
		}
	}
	if (list.length > 0) chunks.push(list.join('\n'));
	return ['# ' + note.title, ...chunks].join('\n\n');
}

// --- HTML ---

function escapeHtml(text) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function htmlListItem(node) {
	const { block } = node;
	let content;
	if (block.type === 'separator') content = '<hr>';
	else if (block.type === 'code') content = '<pre><code>' + escapeHtml(block.content) + '</code></pre>';
	else if (block.type === 'todo') content = todoMark(block) + ' ' + escapeHtml(block.content);
	else content = escapeHtml(block.content);
	const children =
		node.children.length > 0 ? '<ul>' + node.children.map(htmlListItem).join('') + '</ul>' : '';
	return '<li>' + content + children + '</li>';
}

function htmlRootChunk(node) {
	const { block } = node;
	if (block.type === 'bullet' || block.type === 'todo') return htmlListItem(node);
	let element;
	if (block.type === 'separator') element = '<hr>';
	else if (block.type === 'code') element = '<pre><code>' + escapeHtml(block.content) + '</code></pre>';
	else element = '<p>' + escapeHtml(block.content) + '</p>';
	if (node.children.length > 0) {
		element += '<ul>' + node.children.map(htmlListItem).join('') + '</ul>';
	}
	return element;
}

export function noteToHtml(note, blocks) {
	const forest = buildForest(blocks);
	const parts = ['<h1>' + escapeHtml(note.title) + '</h1>'];
	let list = [];
	for (const node of forest) {
		const isListItem = node.block.type === 'bullet' || node.block.type === 'todo';
		if (isListItem) {
			list.push(htmlRootChunk(node));
		} else {
			if (list.length > 0) parts.push('<ul>' + list.join('') + '</ul>');
			list = [];
			parts.push(htmlRootChunk(node));
		}
	}
	if (list.length > 0) parts.push('<ul>' + list.join('') + '</ul>');
	return parts.join('');
}

export function noteExportFileName(title, extension) {
	const slug = title
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'nota'}.${extension}`;
}
