import { describe, expect, it } from 'vitest';
import {
	selectionRange,
	neighborVisibleId,
	orderedSelectionRoots,
	planDeleteSelection,
	planMoveSelection
} from './selection';

function b(id, parentBlockId, order, extra = {}) {
	return { id, parentBlockId: parentBlockId ?? null, order, collapsed: false, ...extra };
}

// a, b, c at root; b has children b1, b2
const tree = [
	b('a', null, 0),
	b('b', null, 1),
	b('b1', 'b', 0),
	b('b2', 'b', 1),
	b('c', null, 2)
];

describe('selectionRange', () => {
	it('returns the visible ids between anchor and focus, inclusive', () => {
		expect(selectionRange(tree, 'a', 'b1')).toEqual(['a', 'b', 'b1']);
	});

	it('works when focus is above anchor', () => {
		expect(selectionRange(tree, 'c', 'b')).toEqual(['b', 'b1', 'b2', 'c']);
	});

	it('is a single id when anchor equals focus', () => {
		expect(selectionRange(tree, 'a', 'a')).toEqual(['a']);
	});

	it('skips descendants hidden by a collapsed parent', () => {
		const collapsed = tree.map((block) => (block.id === 'b' ? { ...block, collapsed: true } : block));
		expect(selectionRange(collapsed, 'a', 'c')).toEqual(['a', 'b', 'c']);
	});
});

describe('neighborVisibleId', () => {
	it('finds the next and previous visible block', () => {
		expect(neighborVisibleId(tree, 'b', 1)).toBe('b1');
		expect(neighborVisibleId(tree, 'b', -1)).toBe('a');
	});

	it('returns null past the edges', () => {
		expect(neighborVisibleId(tree, 'a', -1)).toBe(null);
		expect(neighborVisibleId(tree, 'c', 1)).toBe(null);
	});
});

describe('orderedSelectionRoots', () => {
	it('returns only roots (parent not selected) in visible order', () => {
		// select b, b1, c -> roots are b and c (b1's parent b is selected)
		expect(orderedSelectionRoots(tree, ['c', 'b1', 'b'])).toEqual(['b', 'c']);
	});

	it('keeps a child as a root when its parent is not selected', () => {
		expect(orderedSelectionRoots(tree, ['b1', 'c'])).toEqual(['b1', 'c']);
	});
});

describe('planDeleteSelection', () => {
	it('includes descendants of selected blocks', () => {
		expect(planDeleteSelection(tree, ['b']).sort()).toEqual(['b', 'b1', 'b2']);
	});

	it('dedupes when a parent and its child are both selected', () => {
		expect(planDeleteSelection(tree, ['b', 'b1']).sort()).toEqual(['b', 'b1', 'b2']);
	});

	it('deletes a flat selection as-is', () => {
		expect(planDeleteSelection(tree, ['a', 'c']).sort()).toEqual(['a', 'c']);
	});
});

describe('planMoveSelection', () => {
	it('moves a contiguous sibling run down, subtrees follow via parent ref', () => {
		// select a+b (roots), move down past c
		const plan = planMoveSelection(tree, ['a', 'b'], 1);
		const orders = Object.fromEntries(plan.updates.map((u) => [u.id, u.order]));
		expect(orders['c']).toBe(0);
		expect(orders['a']).toBe(1);
		expect(orders['b']).toBe(2);
	});

	it('moves a run up', () => {
		const plan = planMoveSelection(tree, ['b', 'c'], -1);
		const orders = Object.fromEntries(plan.updates.map((u) => [u.id, u.order]));
		expect(orders['b']).toBe(0);
		expect(orders['c']).toBe(1);
		expect(orders['a']).toBe(2);
	});

	it('returns null at the top edge', () => {
		expect(planMoveSelection(tree, ['a'], -1)).toBe(null);
	});

	it('returns null at the bottom edge', () => {
		expect(planMoveSelection(tree, ['c'], 1)).toBe(null);
	});

	it('returns null when selected roots are not contiguous siblings', () => {
		expect(planMoveSelection(tree, ['a', 'c'], 1)).toBe(null);
	});

	it('returns null when selected roots span different parents', () => {
		expect(planMoveSelection(tree, ['a', 'b1'], 1)).toBe(null);
	});
});
