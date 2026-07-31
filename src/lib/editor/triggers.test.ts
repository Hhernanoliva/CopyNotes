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
		expect(detectTrigger(text, '#')).toEqual({ kind: 'tag', anchor: 0 });
		expect(detectTrigger(bullet, '#')).toEqual({ kind: 'tag', anchor: 0 });
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

describe('detectTrigger with a caret (typing mid-line)', () => {
	it('opens the tag picker on a "#" typed after a space', () => {
		expect(detectTrigger(text, 'hola #', { prevText: 'hola ', caret: 6 })).toEqual({
			kind: 'tag',
			anchor: 5
		});
	});

	it('opens the tag picker on a "#" typed at the very start', () => {
		expect(detectTrigger(text, '#', { prevText: '', caret: 1 })).toEqual({ kind: 'tag', anchor: 0 });
	});

	it('opens the tag picker after a soft line break', () => {
		expect(detectTrigger(text, 'a\n#', { prevText: 'a\n', caret: 3 })).toEqual({
			kind: 'tag',
			anchor: 2
		});
	});

	it('ignores a "#" glued to a word', () => {
		expect(detectTrigger(text, 'hola#', { prevText: 'hola', caret: 5 })).toBe(null);
		expect(detectTrigger(text, 'a#', { prevText: 'a', caret: 2 })).toBe(null);
	});

	it('ignores a pasted "#" (more than one character inserted)', () => {
		expect(detectTrigger(text, 'x #', { prevText: 'x', caret: 3 })).toBe(null);
	});

	it('still opens on a line just emptied with Backspace (browser leaves a <br>)', () => {
		expect(detectTrigger(text, '#', { prevText: '\n', caret: 1 })).toEqual({
			kind: 'tag',
			anchor: 0
		});
	});

	it('ignores a deletion that leaves the caret behind an older "#"', () => {
		expect(detectTrigger(text, 'hola #', { prevText: 'hola #x', caret: 6 })).toBe(null);
	});

	it('ignores a "#" that is not the character just typed', () => {
		expect(detectTrigger(text, 'hola # x', { prevText: 'hola # ', caret: 8 })).toBe(null);
	});

	it('never triggers inside a code block', () => {
		expect(detectTrigger(code, 'hola #', { prevText: 'hola ', caret: 6 })).toBe(null);
	});
});
