import { describe, expect, it } from 'vitest';
import { buildVisibleList, listDescendantIds, flattenTree, ancestorIds } from './hierarchy';

function block(id, parentBlockId = null, order = 0, collapsed = false) {
	return { id, parentBlockId, order, collapsed };
}

describe('buildVisibleList', () => {
	it('lists root blocks in order', () => {
		const blocks = [block('b', null, 1), block('a', null, 0)];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'b']);
		expect(visible.map((row) => row.depth)).toEqual([0, 0]);
	});

	it('places children after their parent with increased depth', () => {
		const blocks = [
			block('a', null, 0),
			block('b', null, 1),
			block('a1', 'a', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'a1', 'a2', 'b']);
		expect(visible.map((row) => row.depth)).toEqual([0, 1, 1, 0]);
	});

	it('marks blocks that have children', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		const visible = buildVisibleList(blocks);
		const byId = new Map(visible.map((row) => [row.block.id, row]));
		expect(byId.get('a').hasChildren).toBe(true);
		expect(byId.get('a1').hasChildren).toBe(false);
		expect(byId.get('b').hasChildren).toBe(false);
	});

	it('hides all descendants of a collapsed block without removing them from data', () => {
		const blocks = [
			block('a', null, 0, true),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'b']);
	});

	it('keeps deeper collapse independent from expanded ancestors', () => {
		const blocks = [
			block('a', null, 0, false),
			block('a1', 'a', 0, true),
			block('a1x', 'a1', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks);
		expect(visible.map((row) => row.block.id)).toEqual(['a', 'a1', 'a2']);
	});

	// Se pone en rojo si `walk(rootId ?? null, 0)` vuelve a decir `walk(null, 0)`:
	// sin la raíz, la lista trae también 'a', 'b' y sus hermanos.
	it('con una raíz lista solo sus descendientes, con la profundidad desde ahi', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		const visible = buildVisibleList(blocks, 'a');
		expect(visible.map((row) => row.block.id)).toEqual(['a1', 'a1x']);
		expect(visible.map((row) => row.depth)).toEqual([0, 1]);
	});

	// Colapsar es "aca no me lo muestres"; entrar es "quiero estar adentro".
	// Rojo si la caminata arranca en la raiz en vez de en sus hijos.
	it('ignora el collapsed de la propia raiz y respeta el de adentro', () => {
		const blocks = [
			block('a', null, 0, true),
			block('a1', 'a', 0, true),
			block('a1x', 'a1', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks, 'a');
		expect(visible.map((row) => row.block.id)).toEqual(['a1', 'a2']);
	});

	// El control de la firma nueva: sin `rootId` nada cambio.
	it('sin rootId da exactamente la lista de siempre', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		expect(buildVisibleList(blocks).map((row) => row.block.id)).toEqual(['a', 'a1', 'b']);
	});
});

describe('ancestorIds', () => {
	// Rojo si la cadena se devuelve al reves o si incluye al propio renglon: las
	// migas la dibujan en ese orden y el renglon raiz no se repite ahi.
	it('devuelve los antepasados del mas lejano al mas cercano, sin el propio', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		expect(ancestorIds(blocks, 'a1x')).toEqual(['a', 'a1']);
	});

	it('un renglon de primer nivel no tiene antepasados', () => {
		expect(ancestorIds([block('a', null, 0)], 'a')).toEqual([]);
	});

	// Rojo si se saca el `seen`: un dato roto colgaria la pantalla en un bucle.
	it('corta si los padres se muerden la cola', () => {
		const blocks = [
			{ id: 'a', parentBlockId: 'b', order: 0 },
			{ id: 'b', parentBlockId: 'a', order: 0 }
		];
		expect(ancestorIds(blocks, 'a').length).toBeLessThanOrEqual(2);
	});
});

describe('flattenTree', () => {
	it('devuelve padres antes que hijos, hermanos por order, sin saltar colapsados', () => {
		const blocks = [
			{ id: 'b', parentBlockId: null, order: 1, collapsed: false },
			{ id: 'a', parentBlockId: null, order: 0, collapsed: true },
			{ id: 'a1', parentBlockId: 'a', order: 0, collapsed: false },
			{ id: 'a2', parentBlockId: 'a', order: 1, collapsed: false }
		];
		const flat = flattenTree(blocks);
		expect(flat.map(({ block }) => block.id)).toEqual(['a', 'a1', 'a2', 'b']);
		expect(flat.map(({ depth }) => depth)).toEqual([0, 1, 1, 0]);
	});
});

describe('listDescendantIds', () => {
	it('returns every nested descendant id', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		expect(listDescendantIds(blocks, 'a').sort()).toEqual(['a1', 'a1x']);
	});

	it('returns empty for a leaf block', () => {
		const blocks = [block('a', null, 0)];
		expect(listDescendantIds(blocks, 'a')).toEqual([]);
	});
});
