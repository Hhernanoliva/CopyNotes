// The export boundary is the privacy gate: notes whose agentVisible is not true
// MUST NOT leave the app through the bridge. v2: the agent sees each visible
// note's PROSE as context plus its PENDING tasks, in document (tree) order.
// A block's comment (`note` field) and completed tasks are physically
// discarded here — they never leave the app, no matter what the server does.

import { listNotes, listBlocksByNote, listActivityByBlock, listFolders } from '$lib/storage';
import { flattenTree } from '$lib/blocks/hierarchy';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 2;

const CONTEXT_TYPES = new Set(['text', 'bullet', 'heading1', 'heading2', 'heading3', 'code']);

function includeBlock(block) {
	if (block.type === 'todo') return block.checked !== true;
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
	const notes = (await listNotes()).filter((note) => note.agentVisible === true);
	const folderNamesById = {};
	for (const folder of await listFolders('note')) folderNamesById[folder.id] = folder.name;
	const blocksByNote = {};
	const activityByBlock = {};
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		for (const block of blocks) {
			if (block.type === 'todo' && block.checked !== true)
				activityByBlock[block.id] = await listActivityByBlock(block.id);
		}
	}
	return { ...toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById), exportedAt: new Date().toISOString() };
}
