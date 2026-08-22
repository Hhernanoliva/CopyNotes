import { describe, expect, it } from 'vitest';
import { planIndent, planOutdent } from './indent';
import { buildVisibleList } from './hierarchy';

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

	// Irse de un nivel no obliga a renumerar a nadie: los que quedan ya están en
	// el orden correcto entre ellos. Restarles 1 era lo que rompía la lista.
	it('no toca a los renglones de abajo', () => {
		const blocks = [block('a', null, 0), block('b', null, 1), block('c', null, 2)];
		const plan = planIndent(blocks, 'b');
		expect(plan.updates).toEqual([{ id: 'b', parentBlockId: 'a', order: 0 }]);
	});

	// El bug que reportó Hernán: con un vecino de posición intermedia (lo que deja
	// un Enter en el medio de la lista), restar 1 empataba dos posiciones y el
	// desempate por id trepaba al de abajo — el renglón indentado se veía caer.
	// Rojo si vuelve el renumerado: 'disnivelado' se dibuja ANTES de 'Rediseñar'.
	it('mantiene el renglón en su lugar aunque el vecino tenga posición intermedia', () => {
		const blocks = [
			{ id: 'r1', parentBlockId: null, order: 0, content: 'Tiene q aparecer' },
			{ id: 'r2', parentBlockId: null, order: 1, content: 'Rediseñar' },
			{ id: 'r3', parentBlockId: null, order: 1.5, content: 'El check vacio' },
			{ id: 'a9', parentBlockId: null, order: 2, content: 'El chek disnivelado' },
			{ id: 'b2', parentBlockId: null, order: 3, content: 'El puntito' }
		];
		const plan = planIndent(blocks, 'r3');
		const after = blocks.map((row) => ({
			...row,
			...(plan.updates.find((update) => update.id === row.id) ?? {})
		}));
		expect(buildVisibleList(after).map(({ block: row, depth }) => [row.id, depth])).toEqual([
			['r1', 0],
			['r2', 0],
			['r3', 1],
			['a9', 0],
			['b2', 0]
		]);
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
	// Cae en el punto medio entre el padre y el que sigue, igual que un Enter:
	// entra entre los dos sin correr a nadie.
	it('moves the block after its old parent under the grandparent', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('z', null, 1)];
		const plan = planOutdent(blocks, 'a1');
		expect(plan.updates).toEqual([{ id: 'a1', parentBlockId: null, order: 0.5 }]);
	});

	it('supports nested levels (grandparent is another block)', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		const plan = planOutdent(blocks, 'a1x');
		expect(plan.updates).toContainEqual({ id: 'a1x', parentBlockId: 'a', order: 1 });
	});

	it('no toca a los hermanos que quedan adentro del padre', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a2', 'a', 1),
			block('a3', 'a', 2)
		];
		const plan = planOutdent(blocks, 'a1');
		expect(plan.updates.some((update) => update.id === 'a2' || update.id === 'a3')).toBe(false);
	});

	// Mismo bug que en planIndent, del otro lado: con un vecino intermedio abajo,
	// el renglón que sale del padre tiene que quedar ENTRE el padre y ese vecino.
	it('sale del padre sin saltar por encima de un vecino con posición intermedia', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('mitad', null, 0.5),
			block('z', null, 1)
		];
		const plan = planOutdent(blocks, 'a1');
		const after = blocks.map((row) => ({
			...row,
			...(plan.updates.find((update) => update.id === row.id) ?? {})
		}));
		expect(buildVisibleList(after).map(({ block: row }) => row.id)).toEqual([
			'a',
			'a1',
			'mitad',
			'z'
		]);
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
