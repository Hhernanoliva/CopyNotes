// Pure arg→change builders and the submitChange-result→MCP-tool-result
// mapper. No fs, no MCP SDK — server.js wires these into registerTool() and
// calls submitChange() (lib/mailbox.js). Kept pure so they're unit-testable
// without stdio or a real buzón.
//
// The change shapes below MUST match src/lib/bridge/ingest.ts's HANDLERS
// allow-list EXACTLY (type string + fields read) — a mismatch means the app
// rejects with reason 'not-allowed'. See that file for the source of truth:
//   createTask({ noteId, content })
//   completeTask({ blockId, text })
//   addNote({ blockId, text })      <- type is 'addNote', not 'addTaskNote'
//
// None of these set `id` (submitChange generates it) or `agentId` (removed —
// the app derives the actor from its own connected-agent identity, never
// from the inbound file).

import { expandId, buildShortIds } from './ids.js';
import { noteToMarkdown } from './resources.js';

export function createTaskChange({ noteId, content }) {
	return { type: 'createTask', noteId, content };
}

export function completeTaskChange({ blockId, summary }) {
	return { type: 'completeTask', blockId, text: summary ?? '' };
}

export function addNoteChange({ blockId, text }) {
	return { type: 'addNote', blockId, text };
}

// Maps a submitChange() result to an MCP CallToolResult. isError iff the app
// rejected the change (or the request never got an answer at all — a missing
// result is treated as a failure, not silently reported as success).
//
// The success message is passed in per-tool (okText) rather than inferred from
// the result shape: every successful mutation — create AND complete — comes
// back as { block, activity }, so a result-shape heuristic can't tell "created"
// from "completed" and would mislabel a completion as a creation. The caller
// (server.js, via makeToolHandler) knows which action ran, so it supplies the
// accurate wording.
export function toolResult(result, okText = 'Listo.') {
	if (result?.ok) {
		return { content: [{ type: 'text', text: okText }], isError: false };
	}
	return {
		content: [{ type: 'text', text: `Rechazado: ${result?.reason ?? 'desconocido'}` }],
		isError: true
	};
}

// Builds an MCP tool callback: parsed args → build the change → submit it to
// the buzón → map the result to a CallToolResult with this tool's own success
// message. submitChangeFn is injected so it can be mocked in tests (the real
// one is lib/mailbox.js's submitChange). Extracting this makes the
// builder↔tool wiring unit-testable — a mis-wire (e.g. complete_task pointed
// at addNoteChange) is caught by asserting the exact submitted change shape.
export function makeToolHandler(buildChange, okText, submitChangeFn) {
	return async (args) => toolResult(await submitChangeFn(buildChange(args)), okText);
}

// Agents act with SHORT ids (what the Markdown projection shows them). The
// server expands them back to real UUIDs before building a change — the app
// and its ingest gate only ever see full UUIDs.
const ID_KIND = { noteId: 'note', blockId: 'task' };

export function expandArgs(exportPayload, args) {
	const resolved = { ...args };
	for (const key of ['noteId', 'blockId']) {
		if (resolved[key] === undefined) continue;
		const res = expandId(exportPayload, resolved[key], ID_KIND[key]);
		if (!res.ok) return { ok: false, reason: res.reason };
		resolved[key] = res.id;
	}
	return { ok: true, args: resolved };
}

// Discovery + read as TOOLS, not only resources. Most MCP clients don't feed
// resources to the model on their own (the user must attach them), so a plain
// prompt like "entrá a la nota X y ejecutá lo anotado" can't reach the note.
// Tools are always model-visible, so these two make that flow work everywhere
// with no hand-holding. read_note returns the SAME Markdown the resource does
// (lib/resources.js) — same privacy rules, same token cost, another door.
export function listNotesResult(exportPayload) {
	const notes = exportPayload?.notes ?? [];
	if (notes.length === 0) {
		return { content: [{ type: 'text', text: 'No hay notas visibles para agentes.' }], isError: false };
	}
	const shortIds = buildShortIds(exportPayload);
	const lines = notes.map((note) => {
		const short = shortIds.get(note.id) ?? note.id;
		const folder = note.folder ? `  ·  ${note.folder}` : '';
		return `- ${short}  ${note.title ?? ''}${folder}`;
	});
	return { content: [{ type: 'text', text: lines.join('\n') }], isError: false };
}

// Resolve a note by short id / full id first, then by exact title
// (case-insensitive), then by a UNIQUE title substring. Ambiguous name → error
// rather than guessing, so the agent picks a precise reference.
function resolveNote(exportPayload, ref) {
	if (!ref) return { ok: false, reason: 'no-encontrado' };
	const notes = exportPayload?.notes ?? [];
	const byId = expandId(exportPayload, ref, 'note');
	if (byId.ok) {
		const found = notes.find((note) => note.id === byId.id);
		if (found) return { ok: true, note: found };
	}
	const lower = ref.toLowerCase();
	const exact = notes.filter((note) => (note.title ?? '').toLowerCase() === lower);
	if (exact.length === 1) return { ok: true, note: exact[0] };
	if (exact.length > 1) return { ok: false, reason: 'ambiguo' };
	const partial = notes.filter((note) => (note.title ?? '').toLowerCase().includes(lower));
	if (partial.length === 1) return { ok: true, note: partial[0] };
	if (partial.length > 1) return { ok: false, reason: 'ambiguo' };
	return { ok: false, reason: 'no-encontrado' };
}

export function readNoteResult(exportPayload, ref) {
	const resolved = resolveNote(exportPayload, ref);
	if (!resolved.ok) {
		return { content: [{ type: 'text', text: `Rechazado: ${resolved.reason}` }], isError: true };
	}
	return {
		content: [{ type: 'text', text: noteToMarkdown(resolved.note, buildShortIds(exportPayload)) }],
		isError: false
	};
}

const HISTORY_TAIL = 10;
const ACTION_VERBS = { created: 'creó', done: 'completó', reopened: 'reabrió', note: 'anotó' };

// Bitácora on demand: the single read that was ~683 tokens inline is now paid
// only when the agent explicitly asks for one task's history.
export function historyResult(exportPayload, blockId) {
	const expanded = expandId(exportPayload, blockId, 'task');
	if (!expanded.ok) {
		return { content: [{ type: 'text', text: `Rechazado: ${expanded.reason}` }], isError: true };
	}
	for (const note of exportPayload?.notes ?? []) {
		const task = (note.blocks ?? []).find((b) => b.type === 'todo' && b.id === expanded.id);
		if (!task) continue;
		const lines = (task.activity ?? [])
			.slice(-HISTORY_TAIL)
			.map((entry) => {
				const rol = entry.actor === 'user' ? 'usuario' : 'agente';
				const verbo = ACTION_VERBS[entry.action] ?? entry.action;
				return `- ${rol} ${verbo}: ${entry.text}`;
			});
		return { content: [{ type: 'text', text: lines.join('\n') || 'Sin historial.' }], isError: false };
	}
	return { content: [{ type: 'text', text: 'Rechazado: no-encontrado' }], isError: true };
}
