// Snippets-only export (specs/005, deferred from Stage 5). A lighter file
// than the full backup for sharing or archiving just the snippet library.
// Import of this format can arrive later; the full JSON backup already
// covers restoring snippets.

export const SNIPPETS_FORMAT = 'copynotes.snippets';

export function buildSnippetsExport(snippets, { exportedAt }) {
	return {
		format: SNIPPETS_FORMAT,
		formatVersion: 1,
		exportedAt,
		counts: { snippets: snippets.length },
		snippets
	};
}

export function snippetsExportFileName(date) {
	return `copynotes-snippets-${date.toISOString().slice(0, 10)}.json`;
}
