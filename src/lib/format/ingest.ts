// The single entry gate for block content that comes from OUTSIDE the editor:
// internal clipboard paste, backup import, and snippet snapshots. Anything
// persisted as block.html must pass through here (or through the editor's own
// sanitizeHtml calls) first — see the contract note in sanitize.ts.
//
// The gate cleans, it never rejects: a malformed node keeps its text and loses
// only what is unusable, so a paste or import cannot crash the editor or
// smuggle markup past the allow-list. Needs a DOM (sanitizeHtml), so it runs
// in the browser and in jsdom tests only — callers live in the UI layer.

import { sanitizeHtml } from './sanitize';
import { BLOCK_TYPES } from './blocktype';
import { isValidDueDate } from '$lib/dates';

function normalizeNode(raw) {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const type = BLOCK_TYPES.includes(raw.type) ? raw.type : 'text';
	return {
		type,
		content: typeof raw.content === 'string' ? raw.content : '',
		html: typeof raw.html === 'string' ? sanitizeHtml(raw.html) : '',
		checked: Boolean(raw.checked),
		codeCollapsed: Boolean(raw.codeCollapsed),
		// Separators never carry a date; everything else keeps a valid one.
		dueDate: type === 'separator' ? null : isValidDueDate(raw.dueDate) ? raw.dueDate : null,
		note: typeof raw.note === 'string' ? raw.note : '',
		tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string') : [],
		children: Array.isArray(raw.children)
			? raw.children.map(normalizeNode).filter(Boolean)
			: []
	};
}

// Clipboard payloads carry a forest (array of root nodes).
export function normalizeForest(forest) {
	if (!Array.isArray(forest)) return null;
	const clean = forest.map(normalizeNode).filter(Boolean);
	return clean.length ? clean : null;
}

// Snippet blockSnapshots carry a single root node.
export function normalizeSnapshotNode(node) {
	return normalizeNode(node);
}

// Backup import: sanitize every html field before the merge plan touches
// storage. Validation (export-import/schema.ts) already guaranteed the shapes;
// this pass only cleans the markup. Blocks without html stay untouched so old
// backups import byte-identical.
export function sanitizeBackupData(data) {
	return {
		...data,
		blocks: data.blocks.map((block) => {
			let clean = block;
			if (typeof block.html === 'string') clean = { ...clean, html: sanitizeHtml(block.html) };
			// A separator must never carry a date, even from a doctored backup.
			if (block.type === 'separator' && block.dueDate != null) clean = { ...clean, dueDate: null };
			// Schema validation is format-only (isoDate accepts 2026-02-30); apply
			// the same calendar-day rule the clipboard/snapshot gate uses.
			else if (block.dueDate != null && !isValidDueDate(block.dueDate))
				clean = { ...clean, dueDate: null };
			return clean;
		}),
		snippets: data.snippets.map((snippet) => {
			const clean = { ...snippet };
			if (typeof snippet.html === 'string') clean.html = sanitizeHtml(snippet.html);
			if (snippet.blockSnapshot) clean.blockSnapshot = normalizeSnapshotNode(snippet.blockSnapshot);
			return clean;
		})
	};
}
