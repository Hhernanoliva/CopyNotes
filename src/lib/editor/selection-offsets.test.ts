import { test, expect } from 'vitest';
import {
	textOffset,
	rangeFromTextOffsets,
	plainTextOffset,
	rangeAtPlainOffset
} from './selection-offsets';

function build(html) {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
}

test('text-node boundary round-trip is stable for a plain block', () => {
	const root = build('hello world');
	const textNode = root.firstChild;
	for (const offset of [0, 5, 11]) {
		const start = textOffset(root, textNode, offset);
		expect(start).toBe(offset);
		const range = rangeFromTextOffsets(root, start, start);
		const back = textOffset(root, range.startContainer, range.startOffset);
		expect(back).toBe(offset);
	}
});

test('boundary text node inside nested <strong>/<a> children', () => {
	const root = build('before <strong>bold</strong> mid <a href="#">link</a> after');
	// "before " (7) + "bold" (4) = 11 -> start of " mid "
	const boldText = root.querySelector('strong').firstChild;
	expect(textOffset(root, boldText, 0)).toBe(7);
	expect(textOffset(root, boldText, 4)).toBe(11);

	const linkText = root.querySelector('a').firstChild;
	// "before "(7) + "bold"(4) + " mid "(5) = 16
	expect(textOffset(root, linkText, 0)).toBe(16);
	expect(textOffset(root, linkText, 2)).toBe(18);

	// Round trip through a range lands back on the same character offset.
	const offset = 18;
	const range = rangeFromTextOffsets(root, offset, offset);
	expect(textOffset(root, range.startContainer, range.startOffset)).toBe(offset);
});

test('element-anchored boundary maps to the caret position, not end-of-block', () => {
	const root = build('<strong>bold</strong> tail');
	// Range boundary anchored on the element itself (container=root, offset=1),
	// as browsers report for e.g. select-all / triple-click: caret sits right
	// before root.childNodes[1] (the " tail" text node), i.e. after "bold".
	const offset = textOffset(root, root, 1);
	expect(offset).toBe(4); // "bold".length, NOT end-of-block (9)
	expect(offset).not.toBe(root.textContent.length);
});

test('element-anchored boundary at end of children maps to end of that element', () => {
	const root = build('<strong>bold</strong> tail');
	const strong = root.querySelector('strong');
	// Caret at the end of <strong>'s children (offset === childNodes.length).
	const offset = textOffset(root, strong, strong.childNodes.length);
	expect(offset).toBe(4);
});

test('select-all via selectNodeContents then round-trip preserves full range', () => {
	const root = build('<strong>bold</strong> tail text');
	const full = root.textContent.length;
	const range = document.createRange();
	range.selectNodeContents(root);

	const start = textOffset(root, range.startContainer, range.startOffset);
	const end = textOffset(root, range.endContainer, range.endOffset);
	expect(start).toBe(0);
	expect(end).toBe(full);

	const rebuilt = rangeFromTextOffsets(root, start, end);
	expect(textOffset(root, rebuilt.startContainer, rebuilt.startOffset)).toBe(0);
	expect(textOffset(root, rebuilt.endContainer, rebuilt.endOffset)).toBe(full);
});

test('empty root falls back to a collapsed range without throwing', () => {
	const root = build('');
	expect(() => rangeFromTextOffsets(root, 0, 0)).not.toThrow();
	const range = rangeFromTextOffsets(root, 0, 0);
	expect(range.collapsed).toBe(true);
});

// plainTextOffset / rangeAtPlainOffset count <br> as one character ('\n'),
// matching htmlToPlainText's view of a rich block.

test('plainTextOffset matches textOffset when there are no <br>', () => {
	const root = build('before <strong>bold</strong> after');
	const boldText = root.querySelector('strong').firstChild;
	expect(plainTextOffset(root, boldText, 2)).toBe(9);
});

test('plainTextOffset counts a <br> as one character', () => {
	const root = build('hola<br>mundo');
	const mundo = root.childNodes[2];
	// "hola"(4) + br(1) + 2 = 7
	expect(plainTextOffset(root, mundo, 2)).toBe(7);
});

test('plainTextOffset handles an element-anchored boundary after a <br>', () => {
	const root = build('hola<br>mundo');
	// Caret anchored on root right before childNodes[2] ("mundo"): after the br.
	expect(plainTextOffset(root, root, 2)).toBe(5);
	// End of every child.
	expect(plainTextOffset(root, root, root.childNodes.length)).toBe(10);
});

test('rangeAtPlainOffset lands inside the text after a <br>', () => {
	const root = build('hola<br>mundo');
	const range = rangeAtPlainOffset(root, 7);
	expect(range.collapsed).toBe(true);
	expect(range.startContainer).toBe(root.childNodes[2]);
	expect(range.startOffset).toBe(2);
});

test('rangeAtPlainOffset round-trips with plainTextOffset across formatting', () => {
	const root = build('a<strong>bc</strong><br><em>de</em>f');
	for (const offset of [0, 1, 2, 3, 4, 5, 6, 7]) {
		const range = rangeAtPlainOffset(root, offset);
		expect(plainTextOffset(root, range.startContainer, range.startOffset)).toBe(offset);
	}
});

test('rangeAtPlainOffset on an empty root returns a collapsed range', () => {
	const root = build('');
	const range = rangeAtPlainOffset(root, 3);
	expect(range.collapsed).toBe(true);
});
