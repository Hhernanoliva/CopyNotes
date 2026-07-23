// The export boundary is the privacy gate: notes whose agentVisible is not true
// MUST NOT leave the app through the bridge. The agent sees TASKS only (todo
// blocks) and their bitácora — never a note's prose body.

import { listNotes, listBlocksByNote, listActivityByBlock } from '$lib/storage';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 1;

function taskFromBlock(block, activity) {
	return {
		id: block.id,
		content: block.content,
		html: block.html,
		checked: block.checked,
		createdBy: block.createdBy ?? 'user',
		activity: activity ?? []
	};
}

export function toAgentPayload(notes, blocksByNote, activityByBlock) {
	const visible = notes.filter((note) => note.agentVisible === true);
	return {
		format: AGENT_EXPORT_FORMAT,
		version: AGENT_EXPORT_VERSION,
		notes: visible.map((note) => ({
			id: note.id,
			title: note.title,
			tasks: (blocksByNote[note.id] ?? [])
				.filter((block) => block.type === 'todo')
				.map((block) => taskFromBlock(block, activityByBlock[block.id]))
		}))
	};
}

export async function buildAgentExport() {
	const notes = (await listNotes()).filter((note) => note.agentVisible === true);
	const blocksByNote = {};
	const activityByBlock = {};
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		for (const block of blocks) {
			if (block.type === 'todo') activityByBlock[block.id] = await listActivityByBlock(block.id);
		}
	}
	return { ...toAgentPayload(notes, blocksByNote, activityByBlock), exportedAt: new Date().toISOString() };
}
