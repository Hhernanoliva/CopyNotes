import { describe, expect, it } from 'vitest';
import { planDrop } from './drop';

function block(id, parentBlockId = null, order = 0) {
	return { id, parentBlockId, order };
}

describe('planDrop', () => {
	it('reorders a root among its siblings', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('c', null, 2)];
		// move c to index 0 at root
		const plan = planDrop(blocks, ['c'], null, 0);
		expect(plan.updates).toContainEqual({ id: 'c', parentBlockId: null, order: 0 });
		expect(plan.updates).toContainEqual({ id: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
	});

	it('nests a block as a child of another', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		// drop b as first child of a
		const plan = planDrop(blocks, ['b'], 'a', 0);
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 0 });
	});

	it('outdents a child to the root', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		// drop a1 at root between a (0) and b (was 1) -> index 1
		const plan = planDrop(blocks, ['a1'], null, 1);
		expect(plan.updates).toContainEqual({ id: 'a1', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'b', order: 2 });
	});

	it('returns null when dropping a block into itself', () => {
		const blocks = [block('a', null, 0)];
		expect(planDrop(blocks, ['a'], 'a', 0)).toBeNull();
	});

	it('returns null when dropping a block into its own descendant', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		expect(planDrop(blocks, ['a'], 'a1x', 0)).toBeNull();
	});

	it('moves only selection roots; children follow via parentBlockId', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		// drag a (root) + a1 (its child) as a group; only a is a root
		const plan = planDrop(blocks, ['a', 'a1'], null, 1);
		// a re-homed after b; a1 not re-parented (still child of a)
		expect(plan.updates).toContainEqual({ id: 'a', parentBlockId: null, order: 1 });
		expect(plan.updates.find((u) => u.id === 'a1' && 'parentBlockId' in u)).toBeUndefined();
	});

	it('renumbers the old parent gapless after a child leaves', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('b', null, 1)
		];
		const plan = planDrop(blocks, ['a1'], null, 1);
		expect(plan.updates).toContainEqual({ id: 'a2', order: 0 }); // was 1, now gapless
	});

	it('returns empty updates when dropped in the same place', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		const plan = planDrop(blocks, ['b'], null, 1); // b already index 1 at root
		expect(plan.updates).toEqual([]);
	});
});

describe('planDrop dentro de una vista con raíz (spec 043)', () => {
	// Rojo si `planDrop` no le pasa la raíz a `orderedSelectionRoots`: con la raíz
	// colapsada, `roots` queda vacío y el arrastre no hace nada, en silencio.
	it('mueve dentro de una raíz colapsada', () => {
		const blocks = [
			{ id: 'r', parentBlockId: null, order: 0, collapsed: true },
			{ id: 'c1', parentBlockId: 'r', order: 0 },
			{ id: 'c2', parentBlockId: 'r', order: 1 }
		];
		const plan = planDrop(blocks, ['c2'], 'r', 0, 'r');
		// El renglón arrastrado siempre lleva su `parentBlockId` en la actualización,
		// aunque el padre no haya cambiado: `planDrop` los re-hospeda a todos igual.
		expect(plan.updates).toContainEqual({ id: 'c2', order: 0, parentBlockId: 'r' });
	});

	// La traducción del llamador: profundidad 0 dentro de la vista cuelga de la
	// raíz de la vista, nunca del primer nivel de la nota.
	it('con la raíz como padre, el renglón queda colgando de ella', () => {
		const blocks = [block('r', null, 0), block('c1', 'r', 0), block('n', 'c1', 0)];
		const plan = planDrop(blocks, ['n'], 'r', 1, 'r');
		expect(plan.updates).toContainEqual({ id: 'n', order: 1, parentBlockId: 'r' });
	});
});
