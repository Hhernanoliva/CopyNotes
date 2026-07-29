// Pure mappers: export payload v2 → what an agent reads. Markdown, not JSON:
// measured on real data it's ~28% cheaper in chars and more in real tokens
// (no \" \n escaping). Read-only projection — tool calls stay structured.
// The bitácora is NOT projected here at all: it's on-demand via the
// get_task_history tool (see server.js), the single biggest token save.

const HEADING_MARKS = { heading1: '#', heading2: '##', heading3: '###' };

// The app rewrites export.json on boot and after every change, so a stale
// `exportedAt` means CopyNotes has not run in a while and what the agent reads
// may lag the real notes. We WARN rather than refuse (spec 030 D2): reading
// with the app closed is a deliberate feature, and writes still queue in inbox/
// until the app opens. A day is the threshold — daily use refreshes the file.
export const EXPORT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function staleExportNotice(exportPayload, now = Date.now()) {
	const at = Date.parse(exportPayload?.exportedAt ?? '');
	if (!Number.isFinite(at)) return null; // nothing to judge — stay quiet
	const age = now - at;
	if (age <= EXPORT_STALE_AFTER_MS) return null;
	const days = Math.floor(age / EXPORT_STALE_AFTER_MS);
	const when = days === 1 ? 'hace 1 día' : `hace ${days} días`;
	return `⚠️ CopyNotes no se abrió desde ${when}: lo que sigue puede estar desactualizado. Los cambios que pidas quedan en espera y se aplican cuando la app se abra.`;
}

export function withStaleNotice(body, exportPayload, now = Date.now()) {
	const notice = staleExportNotice(exportPayload, now);
	return notice ? `${notice}\n\n${body}` : body;
}

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
	// Note's OWN short id goes in the header, id-first like list_notes, so an
	// agent that read the note by name still has the id create_task needs — no
	// extra list_notes round-trip just to learn it. Omitted only when there's no
	// id to show (never happens with real export data; keeps the projection clean).
	const short = shortIds.get(note.id) ?? note.id;
	const prefix = short ? `${short}  ` : '';
	const titleAndFolder = note.folder ? `${note.title}  ·  ${note.folder}` : `${note.title}`;
	const header = `## ${prefix}${titleAndFolder}`;
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
