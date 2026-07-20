import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDragReorder } from './dragReorder.svelte.js';

// Three flat blocks, 30px tall each, stacked from list top.
function makeBlocks() {
	return [
		{ id: 'a', parentBlockId: null, order: 0 },
		{ id: 'b', parentBlockId: null, order: 1 },
		{ id: 'c', parentBlockId: null, order: 2 }
	];
}

const ROW_H = 30;
const ROW_LEFT = 100;

// Fake list element: querySelector returns a stub whose getBoundingClientRect
// places each row by its index. List top is 0 so list-relative == viewport Y.
function makeListEl() {
	const tops = { a: 0, b: 30, c: 60 };
	return {
		getBoundingClientRect: () => ({ top: 0 }),
		querySelector(sel) {
			const id = sel.match(/data-block-id="(.+?)"/)?.[1];
			if (!(id in tops)) return null;
			return {
				getBoundingClientRect: () => ({
					top: tops[id],
					height: ROW_H,
					left: ROW_LEFT
				})
			};
		},
		closest: () => null
	};
}

function pointer(type, clientX, clientY) {
	return new MouseEvent(type, { clientX, clientY, bubbles: true });
}

describe('dragReorder — handle drag', () => {
	let applied;
	let reorder;

	beforeEach(() => {
		applied = [];
		reorder = createDragReorder({
			getBlocks: makeBlocks,
			getSelectedIds: () => [],
			getListEl: makeListEl,
			onApply: (plan) => applied.push(plan)
		});
	});

	afterEach(() => {
		reorder.destroy();
	});

	it('arms immediately from a handle — a small move activates the drag with no hold wait', () => {
		reorder.armFromHandle('a', pointer('pointerdown', ROW_LEFT, 10));
		expect(reorder.active).toBe(false);

		// Move past the threshold right away (no 350ms long-press).
		window.dispatchEvent(pointer('pointermove', ROW_LEFT, 70));
		expect(reorder.active).toBe(true);
	});

	it('applies the move on release over another gap', () => {
		reorder.armFromHandle('a', pointer('pointerdown', ROW_LEFT, 10));
		window.dispatchEvent(pointer('pointermove', ROW_LEFT, 70));
		window.dispatchEvent(pointer('pointerup', ROW_LEFT, 70));

		expect(applied).toHaveLength(1);
		expect(applied[0].updates.length).toBeGreaterThan(0);
	});

	it('a handle press with no movement is a plain click — nothing applied', () => {
		reorder.armFromHandle('a', pointer('pointerdown', ROW_LEFT, 10));
		window.dispatchEvent(pointer('pointerup', ROW_LEFT, 10));

		expect(reorder.active).toBe(false);
		expect(applied).toHaveLength(0);
	});
});

describe('dragReorder — depth resolution with nested rows present', () => {
	// Real DOM truth (measured): every row's [data-block-id] box shares the same
	// left; indentation is padding, so rect.left is depth-independent. The origin
	// must therefore NOT be skewed by the presence of deeper rows.
	const LEFT = 312;
	const H = 30;

	// a (root) → a1 (child); c is a second root, dragged out.
	function nestedBlocks() {
		return [
			{ id: 'a', parentBlockId: null, order: 0 },
			{ id: 'a1', parentBlockId: 'a', order: 0 },
			{ id: 'c', parentBlockId: null, order: 1 }
		];
	}

	function nestedListEl() {
		const tops = { a: 0, a1: 30 }; // c excluded while dragged
		return {
			getBoundingClientRect: () => ({ top: 0 }),
			querySelector(sel) {
				const id = sel.match(/data-block-id="(.+?)"/)?.[1];
				if (!(id in tops)) return null;
				return {
					getBoundingClientRect: () => ({ top: tops[id], height: H, left: LEFT })
				};
			},
			closest: () => null
		};
	}

	let reorder;
	beforeEach(() => {
		reorder = createDragReorder({
			getBlocks: nestedBlocks,
			getSelectedIds: () => [],
			getListEl: nestedListEl,
			onApply: () => {}
		});
	});
	afterEach(() => reorder.destroy());

	it('a straight (no horizontal) drag reads depth 0, not skewed by the nested row', () => {
		reorder.armFromHandle('c', pointer('pointerdown', LEFT, 65));
		window.dispatchEvent(pointer('pointermove', LEFT, 75)); // in the bottom gap, no rightward move
		expect(reorder.active).toBe(true);
		expect(reorder.indicator.depth).toBe(0);
	});

	it('depth is relative to the grab point — grabbing further right does NOT auto-nest', () => {
		// Grabbing the row's text (well right of the grip) and dragging straight
		// down must still read the block's own level, not a deeper one.
		reorder.armFromHandle('c', pointer('pointerdown', LEFT + 48, 65));
		window.dispatchEvent(pointer('pointermove', LEFT + 48, 75)); // straight down from a right grab
		expect(reorder.indicator.depth).toBe(0);
	});

	it('moving right nests deeper — depth follows horizontal movement', () => {
		reorder.armFromHandle('c', pointer('pointerdown', LEFT, 65));
		window.dispatchEvent(pointer('pointermove', LEFT + 48, 75)); // two indents right of grab
		expect(reorder.indicator.depth).toBe(2); // child of a1
	});
});

describe('dragReorder — grabbing an existing selection', () => {
	let applied;
	let clicks;
	let reorder;

	function armSelected(selectedIds) {
		applied = [];
		clicks = [];
		reorder = createDragReorder({
			getBlocks: makeBlocks,
			getSelectedIds: () => selectedIds,
			getListEl: makeListEl,
			onApply: (plan) => applied.push(plan),
			onSelectionClick: () => clicks.push(1)
		});
	}

	afterEach(() => {
		reorder.destroy();
	});

	it('press on a selected row + move activates the drag with no long-press wait', () => {
		armSelected(['a']);
		reorder.armFromPointer('a', pointer('pointerdown', ROW_LEFT, 10));
		window.dispatchEvent(pointer('pointermove', ROW_LEFT, 70));

		expect(reorder.active).toBe(true);
		window.dispatchEvent(pointer('pointerup', ROW_LEFT, 70));
		expect(applied).toHaveLength(1);
		expect(clicks).toHaveLength(0); // a move is a drag, not a click
	});

	it('press on a selected row with no move is a plain click — asks to collapse, applies nothing', () => {
		armSelected(['a']);
		reorder.armFromPointer('a', pointer('pointerdown', ROW_LEFT, 10));
		window.dispatchEvent(pointer('pointerup', ROW_LEFT, 10));

		expect(reorder.active).toBe(false);
		expect(applied).toHaveLength(0);
		expect(clicks).toHaveLength(1);
	});

	it('press on a NON-selected row keeps the long-press path — a quick move cancels, no click callback', () => {
		armSelected([]); // nothing selected
		reorder.armFromPointer('a', pointer('pointerdown', ROW_LEFT, 10));
		window.dispatchEvent(pointer('pointermove', ROW_LEFT, 70)); // quick drag before hold

		expect(reorder.active).toBe(false);
		window.dispatchEvent(pointer('pointerup', ROW_LEFT, 70));
		expect(applied).toHaveLength(0);
		expect(clicks).toHaveLength(0);
	});
});
