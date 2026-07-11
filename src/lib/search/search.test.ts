import { describe, expect, it } from 'vitest';
import { searchAll } from './search';

const dataset = {
	notes: [
		{ id: 'n1', title: 'Plan de trabajo' },
		{ id: 'n2', title: 'Recetas' },
		{ id: 'n3', title: '' }
	],
	blocks: [
		{ id: 'b1', noteId: 'n1', type: 'text', content: 'Llamar al cliente mañana' },
		{ id: 'b2', noteId: 'n2', type: 'bullet', content: 'Milanesas con puré' },
		{ id: 'b3', noteId: 'n3', type: 'todo', content: 'Comprar café' },
		{ id: 'b4', noteId: 'n1', type: 'separator', content: '' }
	],
	snippets: [
		{ id: 's1', name: 'Saludo cliente', content: 'Estimado cliente, gracias' },
		{ id: 's2', name: 'Firma', content: 'Hernán' }
	],
	tagsByTarget: {
		'note:n1': ['t-work'],
		'block:b3': ['t-shopping'],
		'snippet:s2': ['t-work']
	}
};

describe('searchAll', () => {
	it('matches note titles, block content and snippets by text', () => {
		const results = searchAll(dataset, { text: 'cliente', tagIds: [] });
		expect(results.notes).toEqual([]);
		expect(results.blocks.map((block) => block.id)).toEqual(['b1']);
		expect(results.snippets.map((snippet) => snippet.id)).toEqual(['s1']);
	});

	it('is case and accent insensitive', () => {
		const results = searchAll(dataset, { text: 'CAFE', tagIds: [] });
		expect(results.blocks.map((block) => block.id)).toEqual(['b3']);
		expect(searchAll(dataset, { text: 'pure', tagIds: [] }).blocks.map((b) => b.id)).toEqual(['b2']);
	});

	it('matches note titles', () => {
		const results = searchAll(dataset, { text: 'trabajo', tagIds: [] });
		expect(results.notes.map((note) => note.id)).toEqual(['n1']);
	});

	it('filters by tag without text', () => {
		const results = searchAll(dataset, { text: '', tagIds: ['t-work'] });
		expect(results.notes.map((note) => note.id)).toEqual(['n1']);
		expect(results.blocks).toEqual([]);
		expect(results.snippets.map((snippet) => snippet.id)).toEqual(['s2']);
	});

	it('combines text and tag with AND semantics', () => {
		const results = searchAll(dataset, { text: 'firma', tagIds: ['t-work'] });
		expect(results.snippets.map((snippet) => snippet.id)).toEqual(['s2']);
		expect(results.notes).toEqual([]);
	});

	it('requires all selected tags', () => {
		const results = searchAll(dataset, { text: '', tagIds: ['t-work', 't-shopping'] });
		expect(results.notes).toEqual([]);
		expect(results.blocks).toEqual([]);
		expect(results.snippets).toEqual([]);
	});

	it('returns nothing for an empty query', () => {
		const results = searchAll(dataset, { text: '   ', tagIds: [] });
		expect(results.notes).toEqual([]);
		expect(results.blocks).toEqual([]);
		expect(results.snippets).toEqual([]);
	});

	it('ranks name/title matches before content matches for snippets', () => {
		const results = searchAll(
			{
				...dataset,
				snippets: [
					{ id: 'sA', name: 'Otro', content: 'habla del cliente aquí' },
					{ id: 'sB', name: 'Cliente VIP', content: 'texto' }
				]
			},
			{ text: 'cliente', tagIds: [] }
		);
		expect(results.snippets.map((snippet) => snippet.id)).toEqual(['sB', 'sA']);
	});
});
