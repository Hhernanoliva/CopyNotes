import { describe, it, expect } from 'vitest';
import { sliceHtmlByPlainRange, insertHtmlAtPlainOffset, planTextMove } from './text-move';

describe('sliceHtmlByPlainRange', () => {
	it('extracts a plain run by offset', () => {
		expect(sliceHtmlByPlainRange('hola', 1, 3)).toBe('ol');
	});

	it('preserves formatting that spans the run', () => {
		// plain text "a bold c"; extract "bold" (offsets 2..6)
		expect(sliceHtmlByPlainRange('a <strong>bold</strong> c', 2, 6)).toBe('<strong>bold</strong>');
	});
});

describe('insertHtmlAtPlainOffset', () => {
	it('inserts a fragment at a middle offset', () => {
		expect(insertHtmlAtPlainOffset('hello', 2, 'XX')).toBe('heXXllo');
	});

	it('inserts at start and end', () => {
		expect(insertHtmlAtPlainOffset('ab', 0, 'Z')).toBe('Zab');
		expect(insertHtmlAtPlainOffset('ab', 2, 'Z')).toBe('abZ');
	});

	it('keeps the fragment formatting', () => {
		expect(insertHtmlAtPlainOffset('ab', 1, '<em>Z</em>')).toBe('a<em>Z</em>b');
	});
});

describe('planTextMove', () => {
	it('moves a run to another block', () => {
		const plan = planTextMove({
			sourceHtml: 'hola',
			start: 1,
			end: 3,
			targetHtml: 'XYZ',
			dropOffset: 1,
			sameBlock: false
		});
		expect(plan).toEqual({ sourceHtml: 'ha', targetHtml: 'XolYZ', caretOffset: 3 });
	});

	it('same-block forward move shifts the drop offset by the removed length', () => {
		// "ABCDEF": move "CD" (2..4) to the end (offset 6)
		const plan = planTextMove({
			sourceHtml: 'ABCDEF',
			start: 2,
			end: 4,
			targetHtml: 'ABCDEF',
			dropOffset: 6,
			sameBlock: true
		});
		expect(plan.sourceHtml).toBe('ABEFCD');
		expect(plan.targetHtml).toBe('ABEFCD');
		expect(plan.caretOffset).toBe(6);
	});

	it('same-block backward move keeps the drop offset', () => {
		// "ABCDEF": move "CD" (2..4) to the front (offset 0)
		const plan = planTextMove({
			sourceHtml: 'ABCDEF',
			start: 2,
			end: 4,
			targetHtml: 'ABCDEF',
			dropOffset: 0,
			sameBlock: true
		});
		expect(plan.targetHtml).toBe('CDABEF');
		expect(plan.caretOffset).toBe(2);
	});

	it('is a no-op when dropping inside the moved run', () => {
		expect(
			planTextMove({
				sourceHtml: 'ABCDEF',
				start: 2,
				end: 4,
				targetHtml: 'ABCDEF',
				dropOffset: 3,
				sameBlock: true
			})
		).toBeNull();
	});

	it('is a no-op for an empty range', () => {
		expect(
			planTextMove({ sourceHtml: 'abc', start: 2, end: 2, targetHtml: 'x', dropOffset: 0, sameBlock: false })
		).toBeNull();
	});
});
