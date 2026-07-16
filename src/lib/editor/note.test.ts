import { describe, expect, it } from 'vitest';
import { planNoteExit } from './note';

// planNoteExit(text, start, end) decides whether an Enter keypress inside the
// gray note should exit it (double Enter: the caret sits on an empty line).
// Returns { text } with the empty line removed, or null to let the browser
// insert a plain newline.
describe('planNoteExit', () => {
	it('exits when the caret sits on the empty trailing line (double Enter)', () => {
		expect(planNoteExit('hola\n', 5, 5)).toEqual({ text: 'hola' });
	});

	it('keeps writing when the caret is at the end of a non-empty line', () => {
		expect(planNoteExit('hola', 4, 4)).toBeNull();
	});

	it('keeps writing when the caret is in the middle of a non-empty line', () => {
		expect(planNoteExit('hola', 2, 2)).toBeNull();
	});

	it('exits from a completely empty note', () => {
		expect(planNoteExit('', 0, 0)).toEqual({ text: '' });
	});

	it('exits from an empty middle line and removes it', () => {
		expect(planNoteExit('hola\n\nchau', 5, 5)).toEqual({ text: 'hola\nchau' });
	});

	it('strips leftover trailing newlines on exit (Chrome renders the first Enter as \\n\\n)', () => {
		expect(planNoteExit('hola\n\n', 6, 6)).toEqual({ text: 'hola' });
	});

	it('does nothing when there is a text selection', () => {
		expect(planNoteExit('hola\n', 0, 5)).toBeNull();
	});

	it('keeps writing on a multi-line note when the caret line has text', () => {
		expect(planNoteExit('hola\nchau', 9, 9)).toBeNull();
	});
});
