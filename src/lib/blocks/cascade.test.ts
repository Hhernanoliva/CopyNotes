import { describe, expect, it } from 'vitest';
import { planToggleChecked } from './cascade';

function todo(id, parentBlockId = null, order = 0, checked = false) {
	return { id, parentBlockId, order, checked, type: 'todo' };
}

function text(id, parentBlockId = null, order = 0) {
	return { id, parentBlockId, order, checked: false, type: 'text' };
}

describe('planToggleChecked', () => {
	it('toggles a leaf todo on and off', () => {
		const on = planToggleChecked([todo('a')], 'a');
		expect(on.updates).toEqual([{ id: 'a', checked: true }]);
		const off = planToggleChecked([todo('a', null, 0, true)], 'a');
		expect(off.updates).toEqual([{ id: 'a', checked: false }]);
	});

	it('returns null for non-todo blocks', () => {
		expect(planToggleChecked([text('a')], 'a')).toBeNull();
	});

	it('checking a parent checks all todo descendants', () => {
		const blocks = [todo('p'), todo('c1', 'p', 0), todo('c2', 'p', 1), todo('g', 'c1', 0)];
		const plan = planToggleChecked(blocks, 'p');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'p', checked: true },
				{ id: 'c1', checked: true },
				{ id: 'c2', checked: true },
				{ id: 'g', checked: true }
			])
		);
	});

	it('unchecking a parent unchecks all todo descendants', () => {
		const blocks = [
			todo('p', null, 0, true),
			todo('c1', 'p', 0, true),
			todo('c2', 'p', 1, true)
		];
		const plan = planToggleChecked(blocks, 'p');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'p', checked: false },
				{ id: 'c1', checked: false },
				{ id: 'c2', checked: false }
			])
		);
	});

	it('checking the last unchecked child auto-checks the parent', () => {
		const blocks = [todo('p'), todo('c1', 'p', 0, true), todo('c2', 'p', 1, false)];
		const plan = planToggleChecked(blocks, 'c2');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'c2', checked: true },
				{ id: 'p', checked: true }
			])
		);
	});

	it('checking a child while siblings remain unchecked leaves the parent unchecked', () => {
		const blocks = [todo('p'), todo('c1', 'p', 0), todo('c2', 'p', 1)];
		const plan = planToggleChecked(blocks, 'c1');
		expect(plan.updates).toEqual([{ id: 'c1', checked: true }]);
	});

	it('unchecking a child unchecks parent and grandparent', () => {
		const blocks = [
			todo('g', null, 0, true),
			todo('p', 'g', 0, true),
			todo('c', 'p', 0, true)
		];
		const plan = planToggleChecked(blocks, 'c');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'c', checked: false },
				{ id: 'p', checked: false },
				{ id: 'g', checked: false }
			])
		);
	});

	it('parent completion propagates upward across levels', () => {
		const blocks = [
			todo('g'),
			todo('p', 'g', 0),
			todo('c', 'p', 0),
			todo('u', 'g', 1, true)
		];
		const plan = planToggleChecked(blocks, 'c');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'c', checked: true },
				{ id: 'p', checked: true },
				{ id: 'g', checked: true }
			])
		);
	});

	it('ignores non-todo children when completing the parent', () => {
		const blocks = [todo('p'), text('nota', 'p', 0), todo('c', 'p', 1)];
		const plan = planToggleChecked(blocks, 'c');
		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: 'c', checked: true },
				{ id: 'p', checked: true }
			])
		);
	});

	it('does not cascade through a non-todo block in the chain', () => {
		const blocks = [todo('p'), text('b', 'p', 0), todo('deep', 'b', 0)];
		const plan = planToggleChecked(blocks, 'p');
		expect(plan.updates.some((update) => update.id === 'deep')).toBe(false);
	});

	it('only reports blocks whose checked state actually changes', () => {
		const blocks = [todo('p'), todo('c1', 'p', 0, true), todo('c2', 'p', 1)];
		const plan = planToggleChecked(blocks, 'c2');
		expect(plan.updates.some((update) => update.id === 'c1')).toBe(false);
	});
});
