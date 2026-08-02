import { describe, expect, it } from 'vitest';
import { highlightSegments } from './highlight';

describe('highlightSegments', () => {
	it('splits text around a match, case/accent insensitive', () => {
		expect(highlightSegments('Comprar café hoy', 'cafe')).toEqual([
			{ text: 'Comprar ', match: false },
			{ text: 'café', match: true },
			{ text: ' hoy', match: false }
		]);
	});

	it('marks every occurrence', () => {
		expect(highlightSegments('ab ab', 'ab')).toEqual([
			{ text: 'ab', match: true },
			{ text: ' ', match: false },
			{ text: 'ab', match: true }
		]);
	});

	it('returns the whole text unmarked when there is no query', () => {
		expect(highlightSegments('hola', '')).toEqual([{ text: 'hola', match: false }]);
	});

	it('returns the whole text unmarked when nothing matches', () => {
		expect(highlightSegments('hola', 'zzz')).toEqual([{ text: 'hola', match: false }]);
	});

	// An emoji is ONE character to spread but TWO to slice. Counting in one unit
	// and cutting in the other slid every highlight after the emoji to the left.
	it('highlights correctly after an emoji', () => {
		expect(highlightSegments('🎉 fiesta hoy', 'fiesta')).toEqual([
			{ text: '🎉 ', match: false },
			{ text: 'fiesta', match: true },
			{ text: ' hoy', match: false }
		]);
	});

	it('highlights an emoji-carrying match itself', () => {
		expect(highlightSegments('hola 🎉 chau', '🎉')).toEqual([
			{ text: 'hola ', match: false },
			{ text: '🎉', match: true },
			{ text: ' chau', match: false }
		]);
	});
});
