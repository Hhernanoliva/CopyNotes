import { describe, expect, it } from 'vitest';
import { filterTags } from './filter';

const tags = [
	{ id: 't1', name: 'personal' },
	{ id: 't2', name: 'trabajo' },
	{ id: 't3', name: 'ideas trabajo' },
	{ id: 't4', name: 'recetas' }
];

describe('filterTags', () => {
	it('returns everything alphabetically for an empty query', () => {
		expect(filterTags(tags, '').map((tag) => tag.id)).toEqual(['t3', 't1', 't4', 't2']);
	});

	it('ranks prefix matches before substring matches', () => {
		const results = filterTags(tags, 'trab');
		expect(results.map((tag) => tag.id)).toEqual(['t2', 't3']);
	});

	it('matches case-insensitively and ignores a leading #', () => {
		expect(filterTags(tags, '#TRAB').map((tag) => tag.id)).toEqual(['t2', 't3']);
	});

	it('returns empty when nothing matches', () => {
		expect(filterTags(tags, 'zzz')).toEqual([]);
	});
});
