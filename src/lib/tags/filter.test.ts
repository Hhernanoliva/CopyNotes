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

	// `tagNamesMatch` (names.ts) already ignores accents, and the picker asks it
	// whether the typed name exists before offering to create it. Filtering with a
	// stricter rule than that left "cafe" showing nothing AND no create option:
	// the list said the tag does not exist, the create button said it does.
	it('ignores accents, like tagNamesMatch does', () => {
		const accented = [{ id: 'a1', name: 'café' }, { id: 'a2', name: 'diseño' }];
		expect(filterTags(accented, 'cafe').map((tag) => tag.id)).toEqual(['a1']);
		expect(filterTags(accented, 'disen').map((tag) => tag.id)).toEqual(['a2']);
	});

	it('finds an unaccented tag from an accented query', () => {
		const plain = [{ id: 'p1', name: 'cafe' }];
		expect(filterTags(plain, 'café').map((tag) => tag.id)).toEqual(['p1']);
	});
});
