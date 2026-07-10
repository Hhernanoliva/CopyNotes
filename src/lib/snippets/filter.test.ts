import { describe, expect, it } from 'vitest';
import { filterSnippets } from './filter';

const snippets = [
	{ id: 's1', name: 'Saludo formal', content: 'Estimado cliente', isFavorite: false },
	{ id: 's2', name: 'Checklist deploy', content: '- Backup\n- Deploy', isFavorite: true },
	{ id: 's3', name: 'Firma', content: 'Hernán — CopyNotes', isFavorite: false },
	{ id: 's4', name: 'Respuesta rápida', content: 'Gracias por escribir, saludos', isFavorite: true }
];

describe('filterSnippets', () => {
	it('returns favorites first for an empty query', () => {
		const results = filterSnippets(snippets, '');
		expect(results.map((snippet) => snippet.id)).toEqual(['s2', 's4', 's1', 's3']);
	});

	it('matches by name case-insensitively', () => {
		const results = filterSnippets(snippets, 'CHECKLIST');
		expect(results.map((snippet) => snippet.id)).toEqual(['s2']);
	});

	it('matches by content too', () => {
		const results = filterSnippets(snippets, 'estimado');
		expect(results.map((snippet) => snippet.id)).toEqual(['s1']);
	});

	it('keeps favorites first among matches', () => {
		// "saludo"/"saludos": s1 by name, s4 by content (favorite).
		const results = filterSnippets(snippets, 'salud');
		expect(results.map((snippet) => snippet.id)).toEqual(['s4', 's1']);
	});

	it('returns empty when nothing matches', () => {
		expect(filterSnippets(snippets, 'zzz')).toEqual([]);
	});
});
