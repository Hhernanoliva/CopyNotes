import { test, expect } from 'vitest';
import { TEXT_SIZES, sizeClassFor } from './sizes';

test('the three sizes match the three headings', () => {
	expect(TEXT_SIZES.map((size) => size.id)).toEqual(['h1', 'h2', 'h3']);
	expect(TEXT_SIZES.map((size) => size.className)).toEqual([
		'fmt-size-h1',
		'fmt-size-h2',
		'fmt-size-h3'
	]);
});

test('sizeClassFor maps a command name to its class, and nothing else', () => {
	expect(sizeClassFor('h2')).toBe('fmt-size-h2');
	// `normal` clears the size, so it has no class of its own.
	expect(sizeClassFor('normal')).toBe(null);
	expect(sizeClassFor('bold')).toBe(null);
	expect(sizeClassFor(undefined)).toBe(null);
});
