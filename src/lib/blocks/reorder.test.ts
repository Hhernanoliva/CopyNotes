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

	it('returns null for the first block at the root (top of the note)', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(planMoveUp(blocks, 'a')).toBeNull();
	});

	it('moves the first child out of its parent, right above it', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('b', null, 1)
		];
		const plan = planMoveUp(blocks, 'a1');
		expect(plan.updates).toContainEqual({ id: 'a1', parentBlockId: null, order: 0 });
		// The parent and everything after it at that level shift down…
		expect(plan.updates).toContainEqual({ id: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
		// …and the remaining child is renumbered gapless.
		expect(plan.updates).toContainEqual({ id: 'a2', order: 0 });
	});

	it('escapes a nested parent one level at a time', () => {
		const blocks = [block('a', null, 0), block('b', 'a', 0), block('c', 'b', 0)];
		const plan = planMoveUp(blocks, 'c');
		expect(plan.updates).toContainEqual({ id: 'c', parentBlockId: 'a', order: 0 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 1 });
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

	it('returns null for the last block at the root (bottom of the note)', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(planMoveDown(blocks, 'b')).toBeNull();
	});

	it('moves the last child out of its parent, right below it', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('b', null, 1)
		];
		const plan = planMoveDown(blocks, 'a2');
		expect(plan.updates).toContainEqual({ id: 'a2', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
		// The earlier sibling keeps its place: no update for it.
		expect(plan.updates.some((update) => update.id === 'a1')).toBe(false);
	});

	it('a lone child escapes downward too', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		const plan = planMoveDown(blocks, 'a1');
		expect(plan.updates).toContainEqual({ id: 'a1', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
	});
});
