import { describe, expect, it } from 'vitest';
import { dropTarget } from './dnd';

const mk = (id, top, height, extra = {}) => ({
	id,
	top,
	height,
	folderId: null,
	isFolder: false,
	isOpenFolder: false,
	...extra
});

describe('dropTarget', () => {
	const rows = [mk('a', 0, 30), mk('b', 30, 30), mk('c', 60, 30)];

	it('maps the pointer to the insertion gap by row midlines', () => {
		expect(dropTarget(rows, 10)).toEqual({ type: 'insert', container: null, index: 0 });
		expect(dropTarget(rows, 40)).toEqual({ type: 'insert', container: null, index: 1 });
		expect(dropTarget(rows, 100)).toEqual({ type: 'insert', container: null, index: 3 });
	});

	it('targets a folder in its middle band', () => {
		const withFolder = [mk('a', 0, 30), mk('f1', 30, 30, { isFolder: true })];
		expect(dropTarget(withFolder, 45)).toEqual({ type: 'into-folder', folderId: 'f1' });
		// Top edge of the folder row is still an insertion gap.
		expect(dropTarget(withFolder, 32)).toEqual({ type: 'insert', container: null, index: 1 });
	});

	it('gaps between an open folder child rows belong to that folder container', () => {
		const rows = [
			mk('f1', 0, 30, { isFolder: true, isOpenFolder: true }),
			mk('x', 30, 30, { folderId: 'f1' }),
			mk('y', 60, 30, { folderId: 'f1' }),
			mk('b', 90, 30)
		];
		expect(dropTarget(rows, 58)).toEqual({ type: 'insert', container: 'f1', index: 1 });
		// Below the last child but above b's midline: end of the folder.
		expect(dropTarget(rows, 80)).toEqual({ type: 'insert', container: 'f1', index: 2 });
	});

	it('empty list drops at index 0 of the root', () => {
		expect(dropTarget([], 10)).toEqual({ type: 'insert', container: null, index: 0 });
	});

	// The guide already promised "para cancelar: soltá fuera de la lista o apretá
	// Escape". Only row heights were ever consulted, so letting go over the
	// editor still reordered the sidebar. Outside the box = no target, which the
	// caller reads as cancel — the same answer Escape gives.
	describe('pointer outside the list box', () => {
		const box = { width: 240, height: 90 };
		const inside = { ...box, x: 100 };

		it('has no target past either side', () => {
			expect(dropTarget(rows, 40, { ...box, x: box.width + 1 })).toBeNull();
			expect(dropTarget(rows, 40, { ...box, x: -1 })).toBeNull();
		});

		it('has no target above or below the box', () => {
			expect(dropTarget(rows, -1, inside)).toBeNull();
			expect(dropTarget(rows, box.height + 1, inside)).toBeNull();
		});

		it('targets everywhere inside, edges included', () => {
			const middleGap = { type: 'insert', container: null, index: 1 };
			expect(dropTarget(rows, 40, { ...box, x: 0 })).toEqual(middleGap);
			expect(dropTarget(rows, 40, { ...box, x: box.width })).toEqual(middleGap);
			// The very bottom of the box still appends, so "drop at the end" survives
			// even when the container is exactly as tall as its rows.
			expect(dropTarget(rows, box.height, inside)).toEqual({
				type: 'insert',
				container: null,
				index: 3
			});
		});

		it('keeps working when no bounds are given', () => {
			expect(dropTarget(rows, 40)).toEqual({ type: 'insert', container: null, index: 1 });
		});
	});
});
