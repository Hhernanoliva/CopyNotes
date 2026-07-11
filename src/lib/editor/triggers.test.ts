import { describe, expect, it } from 'vitest';
import { detectTrigger } from './triggers';

const text = { type: 'text', content: '' };
const bullet = { type: 'bullet', content: '' };
const code = { type: 'code', content: '' };

describe('detectTrigger', () => {
	it('converts a text block to a bullet on "- "', () => {
		expect(detectTrigger(text, '- comprar')).toEqual({ kind: 'bullet', content: 'comprar' });
	});

	it('converts a text block to a bullet on "* "', () => {
		expect(detectTrigger(text, '* comprar')).toEqual({ kind: 'bullet', content: 'comprar' });
	});

	it('ignores bullet triggers on non-text blocks', () => {
		expect(detectTrigger(bullet, '- x')).toBe(null);
	});

	it('opens the tag picker when the block content is just "#"', () => {
		expect(detectTrigger(text, '#')).toEqual({ kind: 'tag' });
		expect(detectTrigger(bullet, '#')).toEqual({ kind: 'tag' });
	});

	it('does not treat a "#word" as a tag trigger (only a lone #)', () => {
		expect(detectTrigger(text, '#hola')).toBe(null);
	});

	it('never triggers inside a code block', () => {
		expect(detectTrigger(code, '- x')).toBe(null);
		expect(detectTrigger(code, '#')).toBe(null);
	});

	it('returns null for ordinary text', () => {
		expect(detectTrigger(text, 'hola')).toBe(null);
	});
});
