// Backup validation (specs/018). Valibot checks shape and field types; the
// referential checks (noteId, parentBlockId, tagId, targets) run afterwards
// because they need to see the whole backup, not one record at a time.
// Nothing here touches storage — validation must never mutate local data.

import * as v from 'valibot';
import { BLOCK_TYPES } from '../format/blocktype';

export const SUPPORTED_FORMAT = 'copynotes.backup';
// Version 2 added the heading block types; version 3 added the optional block
// dueDate. Shapes are otherwise identical, so 1 and 2 import with no migration.
export const SUPPORTED_VERSIONS = [1, 2, 3];
export const CURRENT_VERSION = 3;

const isoTimestamp = v.pipe(v.string(), v.isoTimestamp());
const nullableTimestamp = v.nullable(isoTimestamp);

const noteSchema = v.looseObject({
	id: v.string(),
	title: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const blockSchema = v.looseObject({
	id: v.string(),
	noteId: v.string(),
	parentBlockId: v.nullable(v.string()),
	type: v.picklist(BLOCK_TYPES),
	content: v.string(),
	// Shape check only — the inline html is sanitized at apply time by the
	// ingest gate (format/ingest.ts) before anything reaches storage.
	html: v.optional(v.string()),
	order: v.number(),
	collapsed: v.boolean(),
	codeCollapsed: v.optional(v.boolean()),
	checked: v.boolean(),
	dueDate: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
	note: v.optional(v.string()),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

// A snippet's saved block tree (id-free nodes, same shape the clipboard
// format uses). Recursive, so it needs v.lazy.
const snapshotNodeSchema = v.looseObject({
	type: v.picklist(BLOCK_TYPES),
	content: v.string(),
	html: v.optional(v.string()),
	checked: v.optional(v.boolean()),
	codeCollapsed: v.optional(v.boolean()),
	dueDate: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
	note: v.optional(v.string()),
	children: v.array(v.lazy(() => snapshotNodeSchema))
});

const snippetSchema = v.looseObject({
	id: v.string(),
	name: v.string(),
	content: v.string(),
	html: v.optional(v.string()),
	blockSnapshot: v.nullish(snapshotNodeSchema),
	isFavorite: v.boolean(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const tagSchema = v.looseObject({
	id: v.string(),
	name: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const tagAssignmentSchema = v.looseObject({
	id: v.string(),
	tagId: v.string(),
	targetType: v.picklist(['note', 'block', 'snippet']),
	targetId: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const settingSchema = v.looseObject({
	key: v.string(),
	value: v.unknown(),
	updatedAt: isoTimestamp
});

const backupSchema = v.looseObject({
	format: v.literal(SUPPORTED_FORMAT),
	formatVersion: v.number(),
	exportedAt: isoTimestamp,
	counts: v.looseObject({}),
	data: v.looseObject({
		notes: v.array(noteSchema),
		blocks: v.array(blockSchema),
		snippets: v.array(snippetSchema),
		tags: v.array(tagSchema),
		tagAssignments: v.array(tagAssignmentSchema),
		settings: v.array(settingSchema)
	})
});

function formatIssues(issues) {
	return issues.map((issue) => {
		const path = (issue.path ?? []).map((segment) => segment.key).join('.');
		return path ? `${path}: ${issue.message}` : issue.message;
	});
}

function referenceErrors(data, existing) {
	const errors = [];
	const noteIds = new Set([...data.notes.map((note) => note.id), ...existing.existingNoteIds]);
	const blockIds = new Set([...data.blocks.map((block) => block.id), ...existing.existingBlockIds]);
	const tagIds = new Set([...data.tags.map((tag) => tag.id), ...existing.existingTagIds]);
	const snippetIds = new Set([
		...data.snippets.map((snippet) => snippet.id),
		...existing.existingSnippetIds
	]);
	for (const block of data.blocks) {
		if (!noteIds.has(block.noteId))
			errors.push(`El bloque ${block.id} apunta a una nota inexistente (${block.noteId}).`);
		if (block.parentBlockId !== null && !blockIds.has(block.parentBlockId))
			errors.push(`El bloque ${block.id} apunta a un bloque padre inexistente.`);
	}
	const targetSets = { note: noteIds, block: blockIds, snippet: snippetIds };
	for (const assignment of data.tagAssignments) {
		if (!tagIds.has(assignment.tagId))
			errors.push(`La asignación ${assignment.id} apunta a una etiqueta inexistente.`);
		const targets = targetSets[assignment.targetType];
		if (targets && !targets.has(assignment.targetId))
			errors.push(`La asignación ${assignment.id} apunta a un destino inexistente.`);
	}
	return errors;
}

const TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'settings'];

// Returns { ok, backup?, errors, warnings }. Counts that disagree with the
// actual arrays are a warning, not an error: the arrays are the truth.
export function validateBackup(raw, existingIds = undefined) {
	const existing = {
		existingNoteIds: existingIds?.existingNoteIds ?? [],
		existingBlockIds: existingIds?.existingBlockIds ?? [],
		existingTagIds: existingIds?.existingTagIds ?? [],
		existingSnippetIds: existingIds?.existingSnippetIds ?? []
	};
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { ok: false, errors: ['El archivo no es un respaldo de CopyNotes.'], warnings: [] };
	}
	if (raw.format !== SUPPORTED_FORMAT) {
		return { ok: false, errors: ['El archivo no es un respaldo de CopyNotes.'], warnings: [] };
	}
	if (!SUPPORTED_VERSIONS.includes(raw.formatVersion)) {
		return {
			ok: false,
			errors: [
				`Este respaldo usa una versión (${raw.formatVersion}) que esta versión de CopyNotes no puede leer.`
			],
			warnings: []
		};
	}
	const parsed = v.safeParse(backupSchema, raw);
	if (!parsed.success) {
		return { ok: false, errors: formatIssues(parsed.issues), warnings: [] };
	}
	const backup = parsed.output;
	const refErrors = referenceErrors(backup.data, existing);
	if (refErrors.length > 0) {
		return { ok: false, errors: refErrors, warnings: [] };
	}
	const warnings = [];
	const counts = {
		notes: backup.data.notes.length,
		blocks: backup.data.blocks.length,
		snippets: backup.data.snippets.length,
		tags: backup.data.tags.length,
		tagAssignments: backup.data.tagAssignments.length,
		settings: backup.data.settings.length
	};
	for (const table of TABLES) {
		const declared = raw.counts?.[table];
		if (declared !== undefined && declared !== counts[table]) {
			warnings.push(`El conteo declarado de ${table} no coincide; se recalculó.`);
		}
	}
	return { ok: true, backup: { ...backup, counts }, errors: [], warnings };
}
