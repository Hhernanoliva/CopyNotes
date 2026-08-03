import { describe, expect, it } from 'vitest';
import { nextFreeOrder, planInsertAfter, sortByOrder } from './ordering';

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

	it('inserts in the middle without renumbering anybody', () => {
		const plan = planInsertAfter(siblings, 'a');
		expect(plan.order).toBe(0.5);
		expect(plan.updates).toEqual([]);
	});

	it('keeps splitting the same gap', () => {
		const withGap = [...siblings, { id: 'nuevo', order: 0.5 }];
		expect(planInsertAfter(withGap, 'a').order).toBe(0.25);
		expect(planInsertAfter(withGap, 'nuevo').order).toBe(0.75);
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

	// Dos aparatos que insertan a la vez después del mismo renglón eligen el mismo
	// número sin hablarse. Lo que no puede pasar es que cada uno dibuje una lista
	// distinta con exactamente los mismos datos: el desempate tiene que dar igual
	// venga la lista como venga.
	it('breaks a tie the same way whatever order the rows arrive in', () => {
		const enPc = [
			{ id: 'a', order: 0 },
			{ id: 'de-la-pc', order: 0.5 },
			{ id: 'del-telefono', order: 0.5 },
			{ id: 'b', order: 1 }
		];
		const enTelefono = [enPc[0], enPc[2], enPc[1], enPc[3]];

		expect(sortByOrder(enPc).map((row) => row.id)).toEqual(
			sortByOrder(enTelefono).map((row) => row.id)
		);
	});
});

describe('nextFreeOrder', () => {
	it('goes past the highest order, not past the count', () => {
		expect(nextFreeOrder([{ id: 'a', order: 0 }, { id: 'b', order: 0.5 }])).toBe(1.5);
		expect(nextFreeOrder([])).toBe(0);
	});
});
