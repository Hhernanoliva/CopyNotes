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
});
