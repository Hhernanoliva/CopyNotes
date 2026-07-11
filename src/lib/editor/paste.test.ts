import { describe, expect, it } from 'vitest';
import { parsePastedLines } from './paste';

describe('parsePastedLines', () => {
	it('drops blank lines and keeps order', () => {
		expect(parsePastedLines('uno\n\n\ndos')).toEqual([
			{ type: 'text', content: 'uno' },
			{ type: 'text', content: 'dos' }
		]);
	});

	it('recognises -, *, • as bullets', () => {
		expect(parsePastedLines('- a\n* b\n• c')).toEqual([
			{ type: 'bullet', content: 'a' },
			{ type: 'bullet', content: 'b' },
			{ type: 'bullet', content: 'c' }
		]);
	});

	it('recognises [ ] and [x] as todos with checked state', () => {
		expect(parsePastedLines('[ ] pan\n[x] llamar\n[X] pagar')).toEqual([
			{ type: 'todo', content: 'pan', checked: false },
			{ type: 'todo', content: 'llamar', checked: true },
			{ type: 'todo', content: 'pagar', checked: true }
		]);
	});

	it('treats everything else as text and trims a trailing \\r', () => {
		expect(parsePastedLines('hola\r\nchau')).toEqual([
			{ type: 'text', content: 'hola' },
			{ type: 'text', content: 'chau' }
		]);
	});

	it('recognises a todo with a leading bullet marker (CopyNotes plain text)', () => {
		expect(parsePastedLines('- [ ] pan\n- [x] llamar')).toEqual([
			{ type: 'todo', content: 'pan', checked: false },
			{ type: 'todo', content: 'llamar', checked: true }
		]);
	});

	it('returns an empty array for empty input', () => {
		expect(parsePastedLines('')).toEqual([]);
		expect(parsePastedLines('\n\n')).toEqual([]);
	});
});
