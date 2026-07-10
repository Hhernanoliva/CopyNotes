import { describe, expect, it } from 'vitest';
import { planMoveDown, planMoveUp } from './reorder';

function block(id, parentBlockId = null, order = 0) {
	return { id, parentBlockId, order };
}

describe('planMoveUp', () => {
	it('swaps order with the previous sibling', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planMoveUp(blocks, 'b');
		expect(plan.updates).toContainEqual({ id: 'b', order: 0 });
		expect(plan.updates).toContainEqual({ id: 'a', order: 1 });
	});

	it('returns null for the first sibling', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(planMoveUp(blocks, 'a')).toBeNull();
	});

	it('only touches siblings within the same parent', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('b', null, 1)
		];
		const plan = planMoveUp(blocks, 'a2');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'a2', order: 0 },
				{ id: 'a1', order: 1 }
			])
		);
		expect(plan.updates).toHaveLength(2);
	});

	it('does not update children of the moved block (they follow the parent)', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('b1', 'b', 0)];
		const plan = planMoveUp(blocks, 'b');
		expect(plan.updates.some((update) => update.id === 'b1')).toBe(false);
	});
});

describe('planMoveDown', () => {
	it('swaps order with the next sibling', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planMoveDown(blocks, 'a');
		expect(plan.updates).toContainEqual({ id: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 0 });
	});

	it('returns null for the last sibling', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(planMoveDown(blocks, 'b')).toBeNull();
	});
});
