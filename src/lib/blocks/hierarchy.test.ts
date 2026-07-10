import { describe, expect, it } from 'vitest';
import { buildVisibleList, listDescendantIds } from './hierarchy';

function block(id, parentBlockId = null, order = 0, collapsed = false) {
	return { id, parentBlockId, order, collapsed };
}

describe('buildVisibleList', () => {
	it('lists root blocks in order', () => {
		const blocks = [block('b', null, 1), block('a', null, 0)];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'b']);
		expect(visible.map((row) => row.depth)).toEqual([0, 0]);
	});

	it('places children after their parent with increased depth', () => {
		const blocks = [
			block('a', null, 0),
			block('b', null, 1),
			block('a1', 'a', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'a1', 'a2', 'b']);
		expect(visible.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
	});

	it('marks blocks that have children', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		const visible = buildVisibleList(blocks);
		const byId = new Map(visible.map((row) => [row.block.id, row]));
		expect(byId.get('a').hasChildren).toBe(true);
		expect(byId.get('a1').hasChildren).toBe(false);
		expect(byId.get('b').hasChildren).toBe(false);
	});

	it('hides all descendants of a collapsed block without removing them from data', () => {
		const blocks = [
			block('a', null, 0, true),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'b']);
	});

	it('keeps deeper collapse independent from expanded ancestors', () => {
		const blocks = [
			block('a', null, 0, false),
			block('a1', 'a', 0, true),
			block('a1x', 'a1', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'a1', 'a2']);
	});
});

describe('listDescendantIds', () => {
	it('returns every nested descendant id', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		expect(listDescendantIds(blocks, 'a').sort()).toEqual(['a1', 'a1x']);
	});

	it('returns empty for a leaf block', () => {
		const blocks = [block('a', null, 0)];
		expect(listDescendantIds(blocks, 'a')).toEqual([]);
	});
});
