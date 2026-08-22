import { describe, expect, it } from 'vitest';
import {
	selectionRange,
	neighborVisibleId,
	orderedSelectionRoots,
	planDeleteSelection,
	planMoveSelection,
	planIndentSelection,
	planOutdentSelection,
	planTypeChangeSelection
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

	it('returns null at the top edge of the note', () => {
		expect(planMoveSelection(tree, ['a'], -1)).toBe(null);
	});

	it('returns null at the bottom edge of the note', () => {
		expect(planMoveSelection(tree, ['c'], 1)).toBe(null);
	});

	it('moves a selection at the top of its parent out, right above the parent', () => {
		// p has s1..s3; select s1+s2 and move up: they land above p at root level.
		const nested = [
			b('p', null, 0),
			b('s1', 'p', 0),
			b('s2', 'p', 1),
			b('s3', 'p', 2),
			b('q', null, 1)
		];
		const plan = planMoveSelection(nested, ['s1', 's2'], -1);
		expect(plan.updates).toContainEqual({ id: 's1', parentBlockId: null, order: 0 });
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 'p', order: 2 });
		expect(plan.updates).toContainEqual({ id: 'q', order: 3 });
		// The sibling left behind is renumbered gapless.
		expect(plan.updates).toContainEqual({ id: 's3', order: 0 });
	});

	it('moves a selection at the bottom of its parent out, right below the parent', () => {
		const nested = [
			b('p', null, 0),
			b('s1', 'p', 0),
			b('s2', 'p', 1),
			b('s3', 'p', 2),
			b('q', null, 1)
		];
		const plan = planMoveSelection(nested, ['s2', 's3'], 1);
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 's3', parentBlockId: null, order: 2 });
		expect(plan.updates).toContainEqual({ id: 'q', order: 3 });
		// The sibling left behind keeps its place: no update for it.
		expect(plan.updates.some((update) => update.id === 's1')).toBe(false);
	});

	it('a selection inside a nested parent escapes one level at a time', () => {
		const nested = [b('a', null, 0), b('p', 'a', 0), b('s1', 'p', 0), b('s2', 'p', 1)];
		const plan = planMoveSelection(nested, ['s1', 's2'], 1);
		expect(plan.updates).toContainEqual({ id: 's1', parentBlockId: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: 'a', order: 2 });
	});

	it('returns null when selected roots are not contiguous siblings', () => {
		expect(planMoveSelection(tree, ['a', 'c'], 1)).toBe(null);
	});

	it('returns null when selected roots span different parents', () => {
		expect(planMoveSelection(tree, ['a', 'b1'], 1)).toBe(null);
	});
});

// a, x, y, z at root; a has one child a1
const flat = [b('a', null, 0), b('a1', 'a', 0), b('x', null, 1), b('y', null, 2), b('z', null, 3)];

describe('planIndentSelection', () => {
	it('moves the whole run under the sibling above it, in order', () => {
		const plan = planIndentSelection(flat, ['x', 'y']);
		expect(plan.updates).toContainEqual({ id: 'x', parentBlockId: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 'y', parentBlockId: 'a', order: 2 });
	});

	it('appends after the existing children of the new parent', () => {
		const empty = [b('a', null, 0), b('x', null, 1), b('y', null, 2)];
		const plan = planIndentSelection(empty, ['x', 'y']);
		expect(plan.updates).toContainEqual({ id: 'x', parentBlockId: 'a', order: 0 });
		expect(plan.updates).toContainEqual({ id: 'y', parentBlockId: 'a', order: 1 });
	});

	// Igual que el Tab de un solo renglón: irse de un nivel no renumera a nadie.
	it('no toca a los renglones que quedan abajo', () => {
		const plan = planIndentSelection(flat, ['x', 'y']);
		expect(plan.updates.some((update) => update.id === 'z')).toBe(false);
	});

	// Contar hijos no dice dónde termina la lista cuando hay posiciones
	// intermedias: con un hijo en 0.5, el 'base = cantidad' pisaba posiciones
	// existentes y el grupo aterrizaba en el medio de los hijos del padre nuevo.
	it('aterriza después de hijos con posiciones intermedias, sin pisar ninguna', () => {
		const fraccionado = [
			b('a', null, 0),
			b('a1', 'a', 0),
			b('a2', 'a', 0.5),
			b('x', null, 1),
			b('y', null, 2)
		];
		const plan = planIndentSelection(fraccionado, ['x', 'y']);
		expect(plan.updates).toContainEqual({ id: 'x', parentBlockId: 'a', order: 1.5 });
		expect(plan.updates).toContainEqual({ id: 'y', parentBlockId: 'a', order: 2.5 });
	});

	it('leaves the descendants alone: they follow their parent', () => {
		const plan = planIndentSelection(tree, ['b', 'b1', 'b2']);
		expect(plan.updates.some((update) => update.id === 'b1')).toBe(false);
		expect(plan.updates).toContainEqual({ id: 'b', parentBlockId: 'a', order: 0 });
	});

	it('returns null when the run starts at the first sibling (nothing above)', () => {
		expect(planIndentSelection(flat, ['a', 'a1', 'x'])).toBe(null);
	});

	it('returns null when selected roots span different parents', () => {
		expect(planIndentSelection(tree, ['b1', 'b2', 'c'])).toBe(null);
	});

	it('returns null when selected roots are not contiguous siblings', () => {
		expect(planIndentSelection(flat, ['x', 'z'])).toBe(null);
	});
});

describe('planOutdentSelection', () => {
	const nested = [
		b('p', null, 0),
		b('s1', 'p', 0),
		b('s2', 'p', 1),
		b('s3', 'p', 2),
		b('q', null, 1)
	];

	it('lands the whole run right below the parent, in order', () => {
		const plan = planOutdentSelection(nested, ['s2', 's3']);
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 's3', parentBlockId: null, order: 2 });
		expect(plan.updates).toContainEqual({ id: 'q', order: 3 });
	});

	it('lands below the parent even when the run sits at the top of it', () => {
		const plan = planOutdentSelection(nested, ['s1', 's2']);
		expect(plan.updates).toContainEqual({ id: 's1', parentBlockId: null, order: 1 });
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: null, order: 2 });
		// The sibling left behind is renumbered gapless.
		expect(plan.updates).toContainEqual({ id: 's3', order: 0 });
	});

	it('goes up one level at a time', () => {
		const deep = [b('a', null, 0), b('p', 'a', 0), b('s1', 'p', 0), b('s2', 'p', 1)];
		const plan = planOutdentSelection(deep, ['s1', 's2']);
		expect(plan.updates).toContainEqual({ id: 's1', parentBlockId: 'a', order: 1 });
		expect(plan.updates).toContainEqual({ id: 's2', parentBlockId: 'a', order: 2 });
	});

	it('returns null at the root level: nothing to come out of', () => {
		expect(planOutdentSelection(flat, ['x', 'y'])).toBe(null);
	});

	it('returns null when selected roots span different parents', () => {
		expect(planOutdentSelection(tree, ['b1', 'b2', 'c'])).toBe(null);
	});
});

// Type change over a selection (spec 031). The tree helper `b` above builds
// blocks with only the hierarchy fields, so these cases pass the extra fields
// (type, content, checked) explicitly.
describe('planTypeChangeSelection', () => {
	const rows = [
		b('a', null, 0, { type: 'bullet', content: 'uno', checked: false }),
		b('sep', null, 1, { type: 'separator', content: '' }),
		b('c', null, 2, { type: 'todo', content: 'tres', checked: true }),
		b('d', null, 3, { type: 'text', content: 'cuatro <b>', checked: false })
	];

	it('converts text and bullet rows into unticked tasks', () => {
		const plan = planTypeChangeSelection(rows, ['a', 'd'], 'todo');
		expect(plan.updates).toEqual([
			{ id: 'a', type: 'todo', checked: false },
			{ id: 'd', type: 'todo', checked: false }
		]);
	});

	it('keeps the tick of a row that was already a task', () => {
		const plan = planTypeChangeSelection(rows, ['c'], 'todo');
		expect(plan.updates).toEqual([{ id: 'c', type: 'todo', checked: true }]);
	});

	// Spec 041: una imagen no se convierte en nada. Sin este salto, la fila se
	// empujaba igual con sólo el `id` — una escritura que no cambia nada.
	it('skips image rows inside the selection', () => {
		const withImage = [...rows, b('img', null, 4, { type: 'image', content: '' })];
		const plan = planTypeChangeSelection(withImage, ['a', 'img'], 'todo');
		expect(plan.updates).toEqual([{ id: 'a', type: 'todo', checked: false }]);
	});

	it('skips separators inside the selection', () => {
		const plan = planTypeChangeSelection(rows, ['a', 'sep', 'c'], 'todo');
		expect(plan.updates.map((update) => update.id)).toEqual(['a', 'c']);
	});

	it('returns the updates in visible order, whatever order the ids come in', () => {
		const plan = planTypeChangeSelection(rows, ['d', 'a'], 'bullet');
		expect(plan.updates.map((update) => update.id)).toEqual(['a', 'd']);
	});

	it('plans only the selected rows, never their unselected children', () => {
		const plan = planTypeChangeSelection(tree, ['b'], 'todo');
		expect(plan.updates.map((update) => update.id)).toEqual(['b']);
	});

	it('drops the tick when the target type is a heading', () => {
		const plan = planTypeChangeSelection(rows, ['c'], 'heading2');
		expect(plan.updates).toEqual([{ id: 'c', type: 'heading2', checked: false }]);
	});

	it('escapes the text into html when converting to code', () => {
		const plan = planTypeChangeSelection(rows, ['d'], 'code');
		expect(plan.updates).toEqual([
			{ id: 'd', type: 'code', checked: false, html: 'cuatro &lt;b&gt;' }
		]);
	});

	it('returns null when nothing in the selection is convertible', () => {
		expect(planTypeChangeSelection(rows, ['sep'], 'todo')).toBeNull();
	});
});

describe('la vista con raíz (spec 043)', () => {
	// La raíz COLAPSADA es el caso que rompe todo si `rootId` no viaja: sin él, la
	// lista visible de la nota no contiene ni un renglón de la rama.
	const rama = () => [
		b('r', null, 0, { collapsed: true, type: 'text', content: 'R' }),
		b('c1', 'r', 0, { type: 'text', content: 'Uno' }),
		b('c2', 'r', 1, { type: 'text', content: 'Dos' }),
		b('c3', 'r', 2, { type: 'text', content: 'Tres' })
	];

	// Rojo si `selectionRange` no recibe la raíz: devuelve [] y Shift+↓ deja de
	// seleccionar adentro de un renglón colapsado.
	it('selectionRange marca el rango dentro de la vista', () => {
		expect(selectionRange(rama(), 'c1', 'c3', 'r')).toEqual(['c1', 'c2', 'c3']);
	});

	// Rojo si `neighborVisibleId` no recibe la raíz: devuelve null y las flechas
	// dejan de cruzar de renglón.
	it('neighborVisibleId camina la vista y se detiene en sus bordes', () => {
		expect(neighborVisibleId(rama(), 'c1', 1, 'r')).toBe('c2');
		expect(neighborVisibleId(rama(), 'c1', -1, 'r')).toBe(null);
	});

	it('orderedSelectionRoots ordena los renglones de la vista', () => {
		expect(orderedSelectionRoots(rama(), ['c3', 'c1'], 'r')).toEqual(['c1', 'c3']);
	});

	// Rojo si `planTypeChangeSelection` recorre la lista de la nota: no encuentra
	// ninguno de los seleccionados y devuelve null.
	it('planTypeChangeSelection convierte los renglones de la vista', () => {
		const plan = planTypeChangeSelection(rama(), ['c1', 'c2'], 'bullet', 'r');
		expect(plan.updates.map((update) => update.id)).toEqual(['c1', 'c2']);
	});

	// El control: `selectionRun` sigue exigiendo hermanos contiguos bajo un mismo
	// padre, y eso no depende de la raíz.
	it('la selección sigue sin ser una unidad si cruza padres', () => {
		const blocks = [...rama(), b('n', 'c1', 0, { type: 'text', content: 'N' })];
		expect(planIndentSelection(blocks, ['c2', 'n'])).toBe(null);
	});
});
