import { describe, expect, it } from 'vitest';
import { normalizeTagName, tagNamesMatch } from './names';

describe('normalizeTagName', () => {
	it('trims and collapses inner whitespace', () => {
		expect(normalizeTagName('  ideas   de   producto  ')).toBe('ideas de producto');
	});

	it('strips a leading # so "#trabajo" and "trabajo" are the same tag', () => {
		expect(normalizeTagName('#trabajo')).toBe('trabajo');
	});

	it('keeps the case the user typed', () => {
		expect(normalizeTagName('Trabajo')).toBe('Trabajo');
	});

	it('returns empty string for blank input', () => {
		expect(normalizeTagName('   ')).toBe('');
		expect(normalizeTagName('#')).toBe('');
	});
});

describe('tagNamesMatch', () => {
	it('matches case-insensitively', () => {
		expect(tagNamesMatch('Trabajo', 'trabajo')).toBe(true);
	});

	it('matches ignoring accents', () => {
		expect(tagNamesMatch('diseño', 'DISEÑO')).toBe(true);
		expect(tagNamesMatch('cafe', 'café')).toBe(true);
	});

	it('rejects different names', () => {
		expect(tagNamesMatch('trabajo', 'personal')).toBe(false);
	});
});
