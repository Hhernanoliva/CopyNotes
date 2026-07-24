import { describe, expect, it } from 'vitest';
import {
	backspaceAction,
	canDeleteFromMenu,
	canDeleteOnBackspace,
	enterOnEmptyAction,
	planEnter,
	planPromoteChildren,
	previousVisibleId
} from './enter';

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

describe('enterOnEmptyAction', () => {
	it('outdents any nested empty block one level', () => {
		expect(enterOnEmptyAction({ type: 'bullet', parentBlockId: 'p' })).toBe('outdent');
		expect(enterOnEmptyAction({ type: 'todo', parentBlockId: 'p' })).toBe('outdent');
		expect(enterOnEmptyAction({ type: 'text', parentBlockId: 'p' })).toBe('outdent');
	});

	it('cancels the type of an empty typed block at root level', () => {
		expect(enterOnEmptyAction({ type: 'bullet', parentBlockId: null })).toBe('convert');
		expect(enterOnEmptyAction({ type: 'todo', parentBlockId: null })).toBe('convert');
		expect(enterOnEmptyAction({ type: 'code', parentBlockId: null })).toBe('convert');
	});

	it('inserts normally for empty root text and separators', () => {
		expect(enterOnEmptyAction({ type: 'text', parentBlockId: null })).toBe('insert');
		expect(enterOnEmptyAction({ type: 'separator', parentBlockId: null })).toBe('insert');
		expect(enterOnEmptyAction({ type: 'separator', parentBlockId: 'p' })).toBe('insert');
	});
});

describe('backspaceAction', () => {
	it('converts typed blocks back to text instead of deleting the row', () => {
		expect(backspaceAction({ type: 'bullet' })).toBe('convert');
		expect(backspaceAction({ type: 'todo' })).toBe('convert');
		expect(backspaceAction({ type: 'code' })).toBe('convert');
	});

	it('deletes plain text rows and separators', () => {
		expect(backspaceAction({ type: 'text' })).toBe('delete');
		expect(backspaceAction({ type: 'separator' })).toBe('delete');
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

describe('planPromoteChildren', () => {
	it('returns null when the block has no children', () => {
		const blocks = [block('a', null, 0), block('b', null, 1)];
		expect(planPromoteChildren(blocks, 'b')).toBe(null);
	});

	it('lifts a single child into the deleted block’s slot', () => {
		// a(0) b(1) c(2), and b has one child b1
		const blocks = [
			block('a', null, 0),
			block('b', null, 1),
			block('b1', 'b', 0),
			block('c', null, 2)
		];
		const plan = planPromoteChildren(blocks, 'b');
		expect(plan.updates).toEqual([{ id: 'b1', parentBlockId: null, order: 1 }]);
	});

	it('lifts several children in order and pushes later siblings down', () => {
		const blocks = [
			block('a', null, 0),
			block('b', null, 1),
			block('b1', 'b', 0),
			block('b2', 'b', 1),
			block('c', null, 2)
		];
		const plan = planPromoteChildren(blocks, 'b');
		expect(plan.updates).toEqual([
			{ id: 'b1', parentBlockId: null, order: 1 },
			{ id: 'b2', parentBlockId: null, order: 2 },
			{ id: 'c', order: 3 }
		]);
	});

	it('promotes children one level up when the block is itself nested', () => {
		// a(0) with children b(0) and a2(1); b has child b1
		const blocks = [
			block('a', null, 0),
			block('b', 'a', 0),
			block('b1', 'b', 0),
			block('a2', 'a', 1)
		];
		const plan = planPromoteChildren(blocks, 'b');
		// b1 takes b's slot (order 0) under a; a2 already sits after it, untouched.
		expect(plan.updates).toEqual([{ id: 'b1', parentBlockId: 'a', order: 0 }]);
	});

	it('leaves grandchildren untouched — they follow their parent implicitly', () => {
		const blocks = [
			block('b', null, 0),
			block('b1', 'b', 0),
			block('b1a', 'b1', 0)
		];
		const plan = planPromoteChildren(blocks, 'b');
		expect(plan.updates).toEqual([{ id: 'b1', parentBlockId: null, order: 0 }]);
	});
});

describe('canDeleteFromMenu', () => {
	it('no permite borrar el único bloque', () => {
		expect(canDeleteFromMenu([block('a')], 'a')).toBe(false);
	});
	it('permite borrar un bloque hoja habiendo otros', () => {
		expect(canDeleteFromMenu([block('a'), block('b')], 'a')).toBe(true);
	});
	it('permite borrar un bloque con hijos (se borra el subárbol)', () => {
		const blocks = [block('a'), block('b', 'a')];
		expect(canDeleteFromMenu(blocks, 'a')).toBe(true);
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
