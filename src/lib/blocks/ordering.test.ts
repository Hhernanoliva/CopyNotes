import { describe, expect, it } from 'vitest';
import { planInsertAfter, sortByOrder } from './ordering';

const siblings = [
	{ id: 'a', order: 0 },
	{ id: 'b', order: 1 },
	{ id: 'c', order: 2 }
];

describe('planInsertAfter', () => {
	it('inserts after the last sibling without touching others', () => {
		const plan = planInsertAfter(siblings, 'c');
		expect(plan.order).toBe(3);
		expect(plan.updates).toEqual([]);
	});

	it('inserts in the middle and bumps later siblings', () => {
		const plan = planInsertAfter(siblings, 'a');
		expect(plan.order).toBe(1);
		expect(plan.updates).toEqual([
			{ id: 'b', order: 2 },
			{ id: 'c', order: 3 }
		]);
	});

	it('appends at the end when the anchor is unknown', () => {
		const plan = planInsertAfter(siblings, 'missing');
		expect(plan.order).toBe(3);
		expect(plan.updates).toEqual([]);
	});

	it('handles an empty sibling list', () => {
		const plan = planInsertAfter([], 'anything');
		expect(plan.order).toBe(0);
		expect(plan.updates).toEqual([]);
	});
});

describe('sortByOrder', () => {
	it('sorts without mutating the input', () => {
		const input = [{ id: 'b', order: 1 }, { id: 'a', order: 0 }];
		const sorted = sortByOrder(input);
		expect(sorted.map((block) => block.id)).toEqual(['a', 'b']);
		expect(input[0].id).toBe('b');
	});
});
