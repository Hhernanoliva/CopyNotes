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

// A fence longer than the longest backtick run in the content, so a code block
// that itself contains ``` can't close the fence early (min 3 per CommonMark).
function fenceFor(content) {
	let longest = 0;
	for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
	return '`'.repeat(Math.max(3, longest + 1));
}

function blockToMarkdown(block, shortIds) {
	const indent = '  '.repeat(block.depth ?? 0);
	if (block.type === 'todo') return `${indent}- [ ] ${shortIds.get(block.id) ?? block.id} ${block.content}`;
	if (block.type === 'bullet') return `${indent}- ${block.content}`;
	if (block.type === 'code') {
		const content = block.content ?? '';
		const fence = fenceFor(content);
		const body = content
			.split('\n')
			.map((line) => indent + line)
			.join('\n');
		return `${indent}${fence}\n${body}\n${indent}${fence}`;
	}
	if (HEADING_MARKS[block.type]) return `${indent}${HEADING_MARKS[block.type]} ${block.content}`;
	return `${indent}${block.content}`; // text
}

export function noteToMarkdown(note, shortIds) {
	const header = note.folder ? `## ${note.title}  ·  ${note.folder}` : `## ${note.title}`;
	const lines = [header];
	let previousWasTodo = false;
	for (const block of note?.blocks ?? []) {
		// Completed tasks are carried in the export (so tools can still resolve
		// and annotate them) but hidden from the agent's context here — the
		// token-saving "agent doesn't see completed tasks" promise lives here.
		if (block.type === 'todo' && block.checked === true) continue;
		const isTodo = block.type === 'todo';
		// blank line between prose chunks; consecutive todos stay together
		if (!(previousWasTodo && isTodo)) lines.push('');
		lines.push(blockToMarkdown(block, shortIds));
		previousWasTodo = isTodo;
	}
	return lines.join('\n');
}
