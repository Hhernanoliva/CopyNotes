// Safe merge planning (specs/018). Pure: local tables + incoming backup data
// in, an insert plan + summary out. Nothing is written here — the storage
// layer applies the plan in one transaction so a failure changes nothing.
//
// Rules: new ids are inserted; identical records are skipped; an id that
// exists locally with different content keeps BOTH versions — the imported
// copy gets a fresh id and every reference to it is remapped.

import { isBackupSafe } from '../storage/settings-registry';

function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
	return (
		'{' +
		Object.keys(value)
			.sort()
			.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]))
			.join(',') +
		'}'
	);
}

function identical(a, b) {
	return stableStringify(a) === stableStringify(b);
}

// Splits one table into inserts/skips and fills remap for id conflicts.
function planTable(localRows, incomingRows, remap, createId) {
	const localById = new Map(localRows.map((row) => [row.id, row]));
	const inserts = [];
	let skipped = 0;
	let conflicts = 0;
	for (const row of incomingRows) {
		const existing = localById.get(row.id);
		if (!existing) {
			inserts.push({ ...row });
		} else if (identical(existing, row)) {
			skipped += 1;
		} else {
			const newId = createId();
			remap.set(row.id, newId);
			inserts.push({ ...row, id: newId });
			conflicts += 1;
		}
	}
	return { inserts, skipped, conflicts };
}

const mapped = (remap) => (id) => (id !== null && remap.has(id) ? remap.get(id) : id);

export function filterSafeSettings(settings) {
	return settings.filter((row) => isBackupSafe(row.key));
}

export function planMerge(local, incoming, options = undefined) {
	const createId = options?.createId ?? (() => crypto.randomUUID());
	const noteRemap = new Map();
	const blockRemap = new Map();
	const tagRemap = new Map();
	const snippetRemap = new Map();
	const folderRemap = new Map();

	const notes = planTable(local.notes, incoming.notes, noteRemap, createId);
	const blocks = planTable(local.blocks, incoming.blocks, blockRemap, createId);
	const snippets = planTable(local.snippets, incoming.snippets, snippetRemap, createId);
	const tags = planTable(local.tags, incoming.tags, tagRemap, createId);
	const folders = planTable(local.folders ?? [], incoming.folders ?? [], folderRemap, createId);

	const toNote = mapped(noteRemap);
	const toBlock = mapped(blockRemap);
	const toFolder = mapped(folderRemap);
	for (const row of blocks.inserts) {
		row.noteId = toNote(row.noteId);
		row.parentBlockId = toBlock(row.parentBlockId);
	}
	for (const row of notes.inserts) {
		if (row.folderId) row.folderId = toFolder(row.folderId);
	}
	for (const row of snippets.inserts) {
		if (row.sourceNoteId) row.sourceNoteId = toNote(row.sourceNoteId);
		if (row.sourceBlockId) row.sourceBlockId = toBlock(row.sourceBlockId);
		if (row.folderId) row.folderId = toFolder(row.folderId);
	}

	const targetRemaps = { note: toNote, block: toBlock, snippet: mapped(snippetRemap) };
	const toTag = mapped(tagRemap);
	// Semantic duplicates (same tag on the same target under another id) would
	// show up twice in the UI, so they are skipped too.
	const linkKey = (row) => `${row.tagId}|${row.targetType}|${row.targetId}`;
	const existingLinks = new Set(local.tagAssignments.map(linkKey));
	const assignments = planTable(local.tagAssignments, incoming.tagAssignments, new Map(), createId);
	assignments.inserts = assignments.inserts.filter((row) => {
		row.tagId = toTag(row.tagId);
		row.targetId = targetRemaps[row.targetType](row.targetId);
		if (existingLinks.has(linkKey(row))) {
			assignments.skipped += 1;
			return false;
		}
		return true;
	});

	// Safe merge never overwrites a preference the user already has, and only
	// known-safe preference keys are restored at all.
	const localSettingKeys = new Set(local.settings.map((row) => row.key));
	const settings = filterSafeSettings(incoming.settings).filter(
		(row) => !localSettingKeys.has(row.key)
	);

	const tables = { notes, blocks, snippets, tags, folders, tagAssignments: assignments };
	const entries = Object.entries(tables);
	const inserts = Object.fromEntries(entries.map(([name, table]) => [name, table.inserts]));
	const conflicts = entries.reduce((total, [, table]) => total + table.conflicts, 0);
	const summary = Object.assign(
		Object.fromEntries(
			entries.map(([name, table]) => [
				name,
				{ added: table.inserts.length, skipped: table.skipped }
			])
		),
		{
			conflicts,
			remapped: conflicts > 0,
			settings: {
				applied: settings.length,
				skipped: incoming.settings.length - settings.length
			}
		}
	);

	return { inserts, settings, summary };
}
