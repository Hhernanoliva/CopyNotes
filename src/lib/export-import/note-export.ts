// Whole-note Markdown/HTML export (specs/007). These are reading/sharing
// formats: soft-deleted blocks must already be filtered out by the caller
// (the repositories do that), unlike the JSON backup which keeps everything.
// Collapsed state is visual only — children always export.

import { sortByOrder } from '../blocks/ordering';
import { HEADING_LEVELS } from '../format/blocktype';
import { htmlInlineToMarkdown } from '../format/inline-markdown';
import { dateSuffix, exportLabel, isValidDueDate } from '$lib/dates';

// Inline formatting (bold, links, colors) lives in block.html; blocks without
// one (old data) fall back to their plain content. Markdown gets the html
// translated to its own syntax; what Markdown can't express (underline,
// colors) degrades to plain text.
function inlineMarkdown(block) {
	return block.html ? htmlInlineToMarkdown(block.html) : block.content;
}

// Markdown headings are single-line; soft breaks inside a heading flatten to spaces.
function markdownHeading(block) {
	return '#'.repeat(HEADING_LEVELS[block.type]) + ' ' + inlineMarkdown(block).split('\n').join(' ');
}

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

function noteLines(block, indent) {
	if (!block.note) return [];
	return block.note.split('\n').map((line) => indent + '  ' + line);
}

function markdownCodeFence(content) {
	const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
	return '`'.repeat(Math.max(3, longest + 1));
}

function markdownListLines(node, depth) {
	const { block } = node;
	const indent = '  '.repeat(depth);
	let lines;
	if (block.type === 'bullet') lines = [indent + '- ' + inlineMarkdown(block)];
	else if (block.type === 'todo') lines = [`${indent}- ${todoMark(block)} ${inlineMarkdown(block)}`];
	else if (block.type === 'separator') lines = [indent + '---'];
	else if (HEADING_LEVELS[block.type]) lines = [indent + markdownHeading(block)];
	else if (block.type === 'code') {
		const fence = markdownCodeFence(block.content);
		lines = [fence, ...block.content.split('\n'), fence].map((line) => indent + line);
	} else lines = inlineMarkdown(block).split('\n').map((line) => indent + line);
	if (isValidDueDate(block.dueDate)) {
		if (block.type === 'code') lines.push(indent + '📅 ' + exportLabel(block.dueDate));
		else lines[lines.length - 1] += dateSuffix(block);
	}
	lines = lines.concat(noteLines(block, indent));
	for (const child of node.children) lines = lines.concat(markdownListLines(child, depth + 1));
	return lines;
}

function markdownRootChunk(node) {
	const { block } = node;
	if (block.type === 'bullet' || block.type === 'todo') return markdownListLines(node, 0).join('\n');
	let lines;
	if (block.type === 'separator') lines = ['---'];
	else if (HEADING_LEVELS[block.type]) lines = [markdownHeading(block)];
	else if (block.type === 'code') {
		const fence = markdownCodeFence(block.content);
		lines = [fence, block.content, fence];
	}
	else lines = [inlineMarkdown(block)];
	if (isValidDueDate(block.dueDate)) {
		if (block.type === 'code') lines.push('📅 ' + exportLabel(block.dueDate));
		else lines[lines.length - 1] += dateSuffix(block);
	}
	lines = lines.concat(noteLines(block, ''));
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

function noteHtml(block) {
	if (!block.note) return '';
	return '<br>' + block.note.split('\n').map(escapeHtml).join('<br>');
}

// The stored inline html keeps bold/links/colors; fall back to escaped content.
function inlineHtml(block) {
	return block.html || escapeHtml(block.content);
}

function headingHtml(block) {
	const level = HEADING_LEVELS[block.type];
	return `<h${level}>` + inlineHtml(block) + `</h${level}>`;
}

function htmlListItem(node) {
	const { block } = node;
	const date = escapeHtml(dateSuffix(block));
	let content;
	if (block.type === 'separator') content = '<hr>';
	else if (HEADING_LEVELS[block.type]) content = headingHtml(block) + date + noteHtml(block);
	else if (block.type === 'code') {
		const codeDate = isValidDueDate(block.dueDate) ? escapeHtml(' 📅 ' + exportLabel(block.dueDate)) : '';
		content = '<pre><code>' + escapeHtml(block.content) + '</code></pre>' + codeDate + noteHtml(block);
	}
	else if (block.type === 'todo') content = todoMark(block) + ' ' + inlineHtml(block) + date + noteHtml(block);
	else content = inlineHtml(block) + date + noteHtml(block);
	const children =
		node.children.length > 0 ? '<ul>' + node.children.map(htmlListItem).join('') + '</ul>' : '';
	return '<li>' + content + children + '</li>';
}

function htmlRootChunk(node) {
	const { block } = node;
	if (block.type === 'bullet' || block.type === 'todo') return htmlListItem(node);
	const date = escapeHtml(dateSuffix(block));
	let element;
	if (block.type === 'separator') element = '<hr>';
	else if (HEADING_LEVELS[block.type]) element = headingHtml(block) + date + noteHtml(block);
	else if (block.type === 'code') {
		const codeDate = isValidDueDate(block.dueDate) ? escapeHtml(' 📅 ' + exportLabel(block.dueDate)) : '';
		element = '<pre><code>' + escapeHtml(block.content) + '</code></pre>' + codeDate + noteHtml(block);
	}
	else element = '<p>' + inlineHtml(block) + date + noteHtml(block) + '</p>';
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
