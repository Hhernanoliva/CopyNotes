import { describe, expect, it } from 'vitest';
import { canDeleteOnBackspace, planEnter, previousVisibleId } from './enter';

function block(id, parentBlockId = null, order = 0, collapsed = false) {
	return { id, parentBlockId, order, collapsed };
}

describe('planEnter', () => {
	it('creates a sibling right after a leaf block', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planEnter(blocks, 'a');
		expect(plan.parentBlockId).toBe(null);
		expect(plan.order).toBe(1);
		expect(plan.updates).toEqual([{ id: 'b', order: 2 }]);
	});

	it('creates a first child when the block has visible children', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0)];
		const plan = planEnter(blocks, 'a');
		expect(plan.parentBlockId).toBe('a');
		expect(plan.order).toBe(0);
		expect(plan.updates).toEqual([{ id: 'a1', order: 1 }]);
	});

	it('creates a sibling when children are hidden by collapse', () => {
		const blocks = [block('a', null, 0, true), block('a1', 'a', 0), block('b', null, 1)];
		const plan = planEnter(blocks, 'a');
		expect(plan.parentBlockId).toBe(null);
		expect(plan.order).toBe(1);
		expect(plan.updates).toEqual([{ id: 'b', order: 2 }]);
	});

	it('creates a sibling inside a nested level', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a2', 'a', 1)];
		const plan = planEnter(blocks, 'a1');
		expect(plan.parentBlockId).toBe('a');
		expect(plan.order).toBe(1);
		expect(plan.updates).toEqual([{ id: 'a2', order: 2 }]);
	});
});

describe('canDeleteOnBackspace', () => {
	it('allows deleting a leaf block', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(canDeleteOnBackspace(blocks, 'b')).toBe(true);
	});

	it('protects blocks that still have children', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		expect(canDeleteOnBackspace(blocks, 'a')).toBe(false);
	});

	it('protects the last remaining block', () => {
		const blocks = [block('a', null, 0)];
		expect(canDeleteOnBackspace(blocks, 'a')).toBe(false);
	});
});

describe('previousVisibleId', () => {
	it('returns the block rendered right above', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		expect(previousVisibleId(blocks, 'b')).toBe('a1');
		expect(previousVisibleId(blocks, 'a1')).toBe('a');
	});

	it('skips blocks hidden by collapse', () => {
		const blocks = [block('a', null, 0, true), block('a1', 'a', 0), block('b', null, 1)];
		expect(previousVisibleId(blocks, 'b')).toBe('a');
	});

	it('returns null for the first visible block', () => {
		const blocks = [block('a', null, 0)];
		expect(previousVisibleId(blocks, 'a')).toBe(null);
	});
});
