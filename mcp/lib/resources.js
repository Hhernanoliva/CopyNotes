// Pure mappers: export payload v2 → what an agent reads. Markdown, not JSON:
// measured on real data it's ~28% cheaper in chars and more in real tokens
// (no \" \n escaping). Read-only projection — tool calls stay structured.
// The bitácora is NOT projected here at all: it's on-demand via the
// get_task_history tool (see server.js), the single biggest token save.

const HEADING_MARKS = { heading1: '#', heading2: '##', heading3: '###' };

export function notesToResources(exportPayload) {
	const notes = exportPayload?.notes ?? [];
	return notes.map((note) => ({
		uri: `copynotes://note/${note.id}`,
		name: note.title ?? '',
		mimeType: 'text/markdown'
	}));
}

function blockToMarkdown(block, shortIds) {
	const indent = '  '.repeat(block.depth ?? 0);
	if (block.type === 'todo') return `${indent}- [ ] ${shortIds.get(block.id) ?? block.id} ${block.content}`;
	if (block.type === 'bullet') return `${indent}- ${block.content}`;
	if (block.type === 'code') return '```\n' + block.content + '\n```';
	if (HEADING_MARKS[block.type]) return `${HEADING_MARKS[block.type]} ${block.content}`;
	return block.content; // text
}

export function noteToMarkdown(note, shortIds) {
	const header = note.folder ? `## ${note.title}  ·  ${note.folder}` : `## ${note.title}`;
	const lines = [header];
	let previousWasTodo = false;
	for (const block of note?.blocks ?? []) {
		const isTodo = block.type === 'todo';
		// blank line between prose chunks; consecutive todos stay together
		if (!(previousWasTodo && isTodo)) lines.push('');
		lines.push(blockToMarkdown(block, shortIds));
		previousWasTodo = isTodo;
	}
	return lines.join('\n');
}
