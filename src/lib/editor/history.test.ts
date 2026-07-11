import { describe, expect, it } from 'vitest';
import { createHistory, diffBlocks } from './history';

describe('createHistory', () => {
	it('undo returns the previous snapshot and redo replays it', () => {
		const h = createHistory({ limit: 10 });
		h.push({ blocks: [{ id: 'a', content: '1' }], focusId: 'a', caretOffset: 1 });
		const current = { blocks: [{ id: 'a', content: '12' }], focusId: 'a', caretOffset: 2 };
		const prev = h.undo(current);
		expect(prev.blocks[0].content).toBe('1');
		const back = h.redo(prev);
		expect(back.blocks[0].content).toBe('12');
	});

	it('a new push clears the redo stack', () => {
		const h = createHistory({ limit: 10 });
		h.push({ blocks: [{ id: 'a', content: '1' }], focusId: 'a', caretOffset: 1 });
		h.undo({ blocks: [{ id: 'a', content: '2' }], focusId: 'a', caretOffset: 1 });
		expect(h.canRedo()).toBe(true);
		h.push({ blocks: [{ id: 'a', content: '3' }], focusId: 'a', caretOffset: 1 });
		expect(h.canRedo()).toBe(false);
	});

	it('caps history at the limit', () => {
		const h = createHistory({ limit: 2 });
		for (let i = 0; i < 5; i++)
			h.push({ blocks: [{ id: 'a', content: String(i) }], focusId: 'a', caretOffset: 0 });
		h.undo({ blocks: [{ id: 'a', content: 'now' }], focusId: 'a', caretOffset: 0 });
		const second = h.undo({ blocks: [], focusId: 'a', caretOffset: 0 });
		expect(second).not.toBeNull();
		expect(h.canUndo()).toBe(false);
	});

	it('undo returns null when there is nothing to undo', () => {
		const h = createHistory();
		expect(h.undo({ blocks: [], focusId: null, caretOffset: 0 })).toBeNull();
	});
});

describe('diffBlocks', () => {
	it('detects created, updated and deleted by id', () => {
		const prev = [
			{ id: 'a', content: '1' },
			{ id: 'b', content: 'x' }
		];
		const next = [
			{ id: 'a', content: '2' },
			{ id: 'c', content: 'new' }
		];
		const d = diffBlocks(prev, next);
		expect(d.deletedIds).toEqual(['b']);
		expect(d.created.map((x) => x.id)).toEqual(['c']);
		expect(d.updated.map((x) => x.id)).toEqual(['a']);
	});

	it('reports no changes for identical arrays', () => {
		const rows = [{ id: 'a', content: '1' }];
		const d = diffBlocks(rows, [{ id: 'a', content: '1' }]);
		expect(d.created).toEqual([]);
		expect(d.updated).toEqual([]);
		expect(d.deletedIds).toEqual([]);
	});
});
