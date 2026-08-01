// The export boundary is the privacy gate: notes whose agentVisible is not true
// MUST NOT leave the app through the bridge. v2: the agent sees each visible
// note's PROSE as context plus its tasks, in document (tree) order. A block's
// comment (`note` field) is physically discarded here — it never leaves the
// app, no matter what the server does.
//
// Completed tasks ARE carried in this payload (with their `checked` flag and
// bitácora) even though the Markdown projection the agent reads hides them.
// Two roles are decoupled on purpose: this export.json is the machine-readable
// substrate the tools resolve short ids and history against, so a task the
// agent just completed can still be annotated (add_note) or reviewed
// (get_task_history). The token-saving "agent doesn't see completed tasks"
// promise is kept by the Markdown filter (lib/resources.js), not by dropping
// them here — dropping them here made their ids unreachable, breaking the
// complete-then-comment flow.

import {
	listNotes,
	listBlocksByNote,
	listActivityByBlock,
	listFolders,
	getAgentsPaused
} from '$lib/storage';
import { flattenTree } from '$lib/blocks/hierarchy';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 2;

const CONTEXT_TYPES = new Set(['text', 'bullet', 'heading1', 'heading2', 'heading3', 'code']);

function includeBlock(block) {
	if (block.type === 'todo') return true; // pending AND completed — the Markdown view filters completed
	if (!CONTEXT_TYPES.has(block.type)) return false;
	return (block.content ?? '').trim() !== '';
}

// Copies ONLY the allow-listed fields. `note` (the user's comment) and `html`
// are never read here — that omission is the second lock for comments.
function projectBlock(block, depth, activity) {
	if (block.type === 'todo') {
		return {
			id: block.id,
			type: 'todo',
			content: block.content,
			checked: block.checked === true,
			depth,
			createdBy: block.createdBy ?? 'user',
			activity: activity ?? []
		};
	}
	return { id: block.id, type: block.type, content: block.content, depth };
}

export function toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById = {}) {
	const visible = notes.filter((note) => note.agentVisible === true);
	return {
		format: AGENT_EXPORT_FORMAT,
		version: AGENT_EXPORT_VERSION,
		notes: visible.map((note) => ({
			id: note.id,
			title: note.title,
			folder: folderNamesById[note.folderId] ?? null,
			blocks: flattenTree(blocksByNote[note.id] ?? [])
				.filter(({ block }) => includeBlock(block))
				.map(({ block, depth }) =>
					projectBlock(block, depth, block.type === 'todo' ? activityByBlock[block.id] : undefined)
				)
		}))
	};
}

export async function buildAgentExport() {
	// Master switch on: the file the agent reads goes out EMPTY, not stale. This
	// is the read half of the pause (ingest.ts holds the write half); leaving the
	// old contents would keep every visible note readable while "paused".
	if (await getAgentsPaused()) {
		// `paused` is the reason, not just the absence of notes: without it the
		// agent reads "no visible notes" and tells the person they never shared
		// anything, when the truth is they pulled the switch.
		return {
			...toAgentPayload([], {}, {}),
			paused: true,
			exportedAt: new Date().toISOString()
		};
	}
	const notes = (await listNotes()).filter((note) => note.agentVisible === true);
	const folderNamesById = {};
	for (const folder of await listFolders('note')) folderNamesById[folder.id] = folder.name;
	const blocksByNote = {};
	const activityByBlock = {};
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		for (const block of blocks) {
			// Load bitácora for every task, completed included: get_task_history and
			// add_note resolve against tasks the agent may have just completed.
			if (block.type === 'todo')
				activityByBlock[block.id] = await listActivityByBlock(block.id);
		}
	}
	return { ...toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById), exportedAt: new Date().toISOString() };
}
