import { describe, expect, it } from 'vitest';
import { buildSnippetsExport, snippetsExportFileName } from './snippets-export';

const snippets = [
	{
		id: 's1',
		name: 'Saludo',
		content: 'Hola equipo',
		blockSnapshot: null,
		sourceNoteId: null,
		sourceBlockId: null,
		isFavorite: true,
		createdAt: '2026-07-10T10:00:00.000Z',
		updatedAt: '2026-07-10T10:00:00.000Z',
		deletedAt: null
	}
];

describe('buildSnippetsExport', () => {
	it('wraps snippets with format metadata', () => {
		const exported = buildSnippetsExport(snippets, { exportedAt: '2026-07-10T12:00:00.000Z' });
		expect(exported.format).toBe('copynotes.snippets');
		expect(exported.formatVersion).toBe(1);
		expect(exported.exportedAt).toBe('2026-07-10T12:00:00.000Z');
		expect(exported.counts.snippets).toBe(1);
		expect(exported.snippets).toEqual(snippets);
	});
});

describe('snippetsExportFileName', () => {
	it('stamps the date', () => {
		expect(snippetsExportFileName(new Date('2026-07-10T12:00:00Z'))).toBe(
			'copynotes-snippets-2026-07-10.json'
		);
	});
});
