import { describe, expect, it } from 'vitest';
import {
	assignInitialOrder,
	buildSidebarTree,
	planDelete,
	planFolderDelete,
	planInsertAtTop,
	planMoveToContainer,
	planReorder,
	sortBySidebarOrder
} from './plans';

const row = (id, sortOrder, extra = {}) => ({ id, sortOrder, ...extra });

describe('sortBySidebarOrder', () => {
	it('sorts by sortOrder and sinks rows without one to the end, stable', () => {
		const rows = [row('c', undefined), row('b', 1), row('d', undefined), row('a', 0)];
		expect(sortBySidebarOrder(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('assignInitialOrder', () => {
	it('numbers rows by their given order, only where changed', () => {
		const updates = assignInitialOrder([row('a', 0), row('b', undefined), row('c', 5)]);
		expect(updates).toEqual([
			{ id: 'b', sortOrder: 1 },
			{ id: 'c', sortOrder: 2 }
		]);
	});
});

describe('planReorder', () => {
	it('moves a row up and renumbers gapless', () => {
		const container = [row('a', 0), row('b', 1), row('c', 2)];
		expect(planReorder(container, 'c', 0).updates).toEqual([
			{ id: 'c', sortOrder: 0 },
			{ id: 'a', sortOrder: 1 },
			{ id: 'b', sortOrder: 2 }
		]);
	});
	it('is a no-op when the position does not change', () => {
		const container = [row('a', 0), row('b', 1)];
		expect(planReorder(container, 'b', 1).updates).toEqual([]);
	});
	it('returns no updates for an unknown id', () => {
		expect(planReorder([row('a', 0)], 'ghost', 0).updates).toEqual([]);
	});
});

describe('planDelete', () => {
	it('closes the gap left by a deleted row, renumbering survivors gapless', () => {
		const container = [row('a', 0), row('b', 1), row('c', 2), row('d', 3)];
		expect(planDelete(container, 'b').updates).toEqual([
			{ id: 'c', sortOrder: 1 },
			{ id: 'd', sortOrder: 2 }
		]);
	});
	it('is a no-op when the last row is deleted (no gap to close)', () => {
		const container = [row('a', 0), row('b', 1)];
		expect(planDelete(container, 'b').updates).toEqual([]);
	});
	it('returns no updates for an unknown id', () => {
		expect(planDelete([row('a', 0)], 'ghost').updates).toEqual([]);
	});
});

describe('planInsertAtTop', () => {
	it('shifts every row down one', () => {
		expect(planInsertAtTop([row('a', 0), row('b', 1)])).toEqual([
			{ id: 'a', sortOrder: 1 },
			{ id: 'b', sortOrder: 2 }
		]);
	});
});

describe('planMoveToContainer', () => {
	it('moves a row into a folder at the top and renumbers both sides', () => {
		const root = [row('f1', 0), row('a', 1), row('b', 2)];
		const inside = [row('x', 0)];
		const { updates } = planMoveToContainer(root, inside, 'b', 0, 'f1');
		expect(updates).toContainEqual({ id: 'b', folderId: 'f1', sortOrder: 0 });
		expect(updates).toContainEqual({ id: 'x', sortOrder: 1 });
		// root closes the gap: f1 keeps 0, a keeps 1 → no update for them
		expect(updates.filter((u) => u.id === 'a' || u.id === 'f1')).toEqual([]);
	});
	it('moves a row out of a folder to a root position', () => {
		const inside = [row('x', 0), row('y', 1)];
		const root = [row('f1', 0), row('a', 1)];
		const { updates } = planMoveToContainer(inside, root, 'y', 1, null);
		expect(updates).toContainEqual({ id: 'y', folderId: null, sortOrder: 1 });
		expect(updates).toContainEqual({ id: 'a', sortOrder: 2 });
	});
});

describe('planFolderDelete', () => {
	it('drops folder contents into the root at the folder position', () => {
		const root = [row('a', 0), row('f1', 1), row('b', 2)];
		const contents = [row('x', 0), row('y', 1)];
		const { updates } = planFolderDelete(root, contents, 'f1');
		expect(updates).toContainEqual({ id: 'x', folderId: null, sortOrder: 1 });
		expect(updates).toContainEqual({ id: 'y', folderId: null, sortOrder: 2 });
		expect(updates).toContainEqual({ id: 'b', sortOrder: 3 });
		expect(updates.filter((u) => u.id === 'a')).toEqual([]);
	});
});

describe('buildSidebarTree', () => {
	it('mixes folders and loose items by sortOrder, children sorted inside', () => {
		const folders = [row('f1', 1, { name: 'Carpeta' })];
		const items = [
			row('a', 0),
			row('x', 1, { folderId: 'f1' }),
			row('w', 0, { folderId: 'f1' }),
			row('b', 2)
		];
		const tree = buildSidebarTree(items, folders);
		expect(tree.map((n) => (n.kind === 'folder' ? n.folder.id : n.item.id))).toEqual([
			'a',
			'f1',
			'b'
		]);
		expect(tree[1].children.map((c) => c.id)).toEqual(['w', 'x']);
	});
	it('treats items pointing at a missing folder as root items', () => {
		const tree = buildSidebarTree([row('a', 0, { folderId: 'ghost' })], []);
		expect(tree).toEqual([{ kind: 'item', item: row('a', 0, { folderId: 'ghost' }) }]);
	});
});
