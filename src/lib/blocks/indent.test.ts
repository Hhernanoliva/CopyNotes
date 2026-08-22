import { describe, expect, it } from 'vitest';
import { planIndent, planOutdent } from './indent';

function block(id, parentBlockId = null, order = 0) {
	return { id, parentBlockId, order };
}

describe('planIndent', () => {
	it('moves the block under its previous sibling', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 0 });
	});

	it('appends after existing children of the new parent', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 1 });
	});

	it('appends after fractional and gapped child orders without reusing a position', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', -2),
			block('a2', 'a', 4.5),
			block('b', null, 1)
		];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 5.5 });
	});

	it('closes the gap left among old siblings', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('c', null, 2)];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates).toContainEqual({ id: 'c', order: 1 });
	});

	it('returns null for the first sibling (nothing to indent under)', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0)];
		expect(planIndent(blocks, 'a')).toBeNull();
		expect(planIndent(blocks, 'a1')).toBeNull();
	});

	it('keeps the moved block children attached (no updates for them)', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('b1', 'b', 0)];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates.some((update) => update.id === 'b1')).toBe(false);
	});
});

describe('planOutdent', () => {
	it('moves the block after its old parent under the grandparent', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('z', null, 1)];
		const plan = planOutdent(blocks, 'a1');
		expect(plan.updates).toContainEqual({ id: 'a1', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'z', order: 2 });
	});

	it('supports nested levels (grandparent is another block)', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		const plan = planOutdent(blocks, 'a1x');
		expect(plan.updates).toContainEqual({ id: 'a1x', parentBlockId: 'a', order: 1 });
	});

	it('closes the gap among old siblings', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('a3', 'a', 2)
		];
		const plan = planOutdent(blocks, 'a1');
		expect(plan.updates).toContainEqual({ id: 'a2', order: 0 });
		expect(plan.updates).toContainEqual({ id: 'a3', order: 1 });
	});

	it('returns null for a root block', () => {
		const blocks = [block('a', null, 0)];
		expect(planOutdent(blocks, 'a')).toBeNull();
	});

	// Rojo si la comparación vuelve a ser contra `null`: sin esto, Shift+Tab en el
	// primer nivel de la vista manda el renglón afuera de la vista, que es el
	// síntoma peor de esta app — se lee como pérdida de datos (spec 043).
	it('devuelve null cuando el padre del renglón ES la raíz de la vista', () => {
		const blocks = [block('r', null, 0), block('c', 'r', 0)];
		expect(planOutdent(blocks, 'c', 'r')).toBe(null);
	});

	it('sigue sacando un nivel cuando el padre no es la raíz', () => {
		const blocks = [block('r', null, 0), block('c', 'r', 0), block('n', 'c', 0)];
		const plan = planOutdent(blocks, 'n', 'r');
		expect(plan.updates).toContainEqual({ id: 'n', parentBlockId: 'r', order: 1 });
	});
});
