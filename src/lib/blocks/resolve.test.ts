import { describe, expect, it } from 'vitest';
import { resolveDrop } from './resolve';

// three flat root rows, 20px tall each, stacked from top 0
const flat = [
	{ id: 'a', depth: 0, hasChildren: false, top: 0, height: 20 },
	{ id: 'b', depth: 0, hasChildren: false, top: 20, height: 20 },
	{ id: 'c', depth: 0, hasChildren: false, top: 40, height: 20 }
];

describe('resolveDrop', () => {
	it('returns null for an empty list', () => {
		expect(resolveDrop([], 0, 0, 0, 24)).toBeNull();
	});

	it('drops before the first row when pointer is above all midpoints', () => {
		const r = resolveDrop(flat, 0, 2, 0, 24); // y=2 above a's midpoint (10)
		expect(r.newParentId).toBeNull();
		expect(r.insertIndex).toBe(0);
	});

	it('drops between rows a and b at the gap after a', () => {
		const r = resolveDrop(flat, 0, 15, 0, 24); // past a midpoint, before b midpoint
		expect(r.newParentId).toBeNull();
		expect(r.insertIndex).toBe(1);
	});

	it('nests as child of the previous row when dragged right', () => {
		const prevHasKids = [
			{ id: 'a', depth: 0, hasChildren: false, top: 0, height: 20 },
			{ id: 'b', depth: 0, hasChildren: false, top: 20, height: 20 }
		];
		// gap after a (y=15), pointerX one indent right of origin -> depth 1 under a
		const r = resolveDrop(prevHasKids, 24, 15, 0, 24);
		expect(r.newParentId).toBe('a');
		expect(r.insertIndex).toBe(0);
		expect(r.indicatorDepth).toBe(1);
	});

	it('clamps depth to previous row depth + 1', () => {
		const r = resolveDrop(flat, 999, 15, 0, 24); // far right after a (depth 0)
		expect(r.indicatorDepth).toBe(1); // can't be deeper than a child of a
		expect(r.newParentId).toBe('a');
	});

	it('outdents to an ancestor when dragged left in a nested gap', () => {
		const nested = [
			{ id: 'a', depth: 0, hasChildren: true, top: 0, height: 20 },
			{ id: 'a1', depth: 1, hasChildren: false, top: 20, height: 20 },
			{ id: 'b', depth: 0, hasChildren: false, top: 40, height: 20 }
		];
		// gap after a1 (y=35), pointerX at origin -> depth 0 -> sibling of a
		const r = resolveDrop(nested, 0, 35, 0, 24);
		expect(r.newParentId).toBeNull();
		expect(r.indicatorDepth).toBe(0);
		expect(r.insertIndex).toBe(1); // after a at root
	});
});
