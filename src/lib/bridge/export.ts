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
	listActivityByNote,
	listFolders,
	getAgentsPaused
} from '$lib/storage';
import { actorName } from '$lib/storage/share-names';
import { myMemberActor } from '$lib/sync/identity';
import { flattenTree } from '$lib/blocks/hierarchy';
import { imageExportText } from '$lib/images/export-text';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 2;

const CONTEXT_TYPES = new Set(['text', 'bullet', 'heading1', 'heading2', 'heading3', 'code']);

function includeBlock(block) {
	if (block.type === 'todo') return true; // pending AND completed — the Markdown view filters completed
	if (block.type === 'image') return true; // se avisa igual sin descripción, como en el export a archivo
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
	if (block.type === 'image') {
		return { id: block.id, type: 'image', content: imageExportText(block), depth };
	}
	return { id: block.id, type: block.type, content: block.content, depth };
}

export function toAgentPayload(
	notes,
	blocksByNote,
	activityByBlock,
	folderNamesById = {},
	doneByNote = {}
) {
	const visible = notes.filter((note) => note.agentVisible === true);
	return {
		format: AGENT_EXPORT_FORMAT,
		version: AGENT_EXPORT_VERSION,
		notes: visible.map((note) => ({
			id: note.id,
			title: note.title,
			folder: folderNamesById[note.folderId] ?? null,
			// `done`: la última declaración de "Listo" sobre esta nota, ya con el
			// nombre resuelto (spec 038 §8). Sólo la última — es un ESTADO, y lo que
			// el agente necesita es si está dicho ahora, no cuántas veces se dijo.
			// Aditivo: nada que lea `note.blocks` se entera de que existe.
			done: (doneByNote[note.id] ?? []).at(-1) ?? null,
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
	const doneByNote = {};
	const myActor = await myMemberActor();
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		// Load bitácora for every task, completed included: get_task_history and
		// add_note resolve against tasks the agent may have just completed. ONE
		// indexed read per note, then split by task here — this runs on every
		// agent write, and a query per task made that cost grow with the user's
		// task count. `listActivityByNote` already sorts by seq, and grouping
		// keeps each task's lines in that order.
		for (const block of blocks) if (block.type === 'todo') activityByBlock[block.id] = [];
		// El nombre se resuelve ACÁ, de este lado (spec 038 §6). El cachecito es una
		// tabla de Dexie y el servidor MCP corre en otro proceso: si baja
		// `member:<uuid>` pelado, no hay nadie del otro lado que lo pueda traducir.
		//
		// Un nombre por actor distinto, no uno por línea: una nota con quince tildes
		// de Juan haría quince lecturas, y esto corre en CADA escritura del agente.
		const ctx = { noteId: note.id, role: note.share ?? null, myActor };
		const nombres = new Map();
		for (const row of await listActivityByNote(note.id)) {
			if (!nombres.has(row.actor)) nombres.set(row.actor, await actorName(row.actor, ctx));
			const conNombre = { ...row, actorLabel: nombres.get(row.actor) };
			// Una entrada de nota entera ("Listo") no cuelga de ningún renglón, así
			// que el agrupamiento de al lado la tiraría. Va aparte, en la nota,
			// porque es lo que es: un estado de la nota.
			if (row.blockId === null) (doneByNote[note.id] ??= []).push(conNombre);
			else activityByBlock[row.blockId]?.push(conNombre);
		}
	}
	return {
		...toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById, doneByNote),
		exportedAt: new Date().toISOString()
	};
}
