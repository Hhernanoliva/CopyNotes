import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	treeToNode,
	flattenNode,
	serializeForest,
	deserializeForest,
	rememberCopy,
	recallCopy,
	purgeStaleCopy,
	COPY_BUFFER_TTL_MS
} from './serialize';

function tree(block, children = []) {
	return { block, children };
}

describe('treeToNode', () => {
	it('flattens a copy tree into an id-free node with children and tags', () => {
		const t = tree({ id: 'a', type: 'bullet', content: 'padre', checked: false, note: 'nota' }, [
			tree({ id: 'b', type: 'todo', content: 'hijo', checked: true })
		]);
		const tagsById = { a: [{ id: 't1', name: 'trabajo' }], b: [] };
		expect(treeToNode(t, tagsById)).toEqual({
			type: 'bullet',
			content: 'padre',
			html: '',
			checked: false,
			codeCollapsed: false,
			dueDate: null,
			note: 'nota',
			tags: ['trabajo'],
			children: [
				{
					type: 'todo',
					content: 'hijo',
					html: '',
					checked: true,
					codeCollapsed: false,
					dueDate: null,
					note: '',
					tags: [],
					children: []
				}
			]
		});
	});

	it('defaults tags to an empty array when no map is given', () => {
		expect(treeToNode(tree({ id: 'a', type: 'text', content: 'x' })).tags).toEqual([]);
	});

	it('carries the real sanitized html through, when present', () => {
		const t = tree({ id: 'a', type: 'text', content: 'hola', html: '<strong>hola</strong>' });
		expect(treeToNode(t).html).toBe('<strong>hola</strong>');
	});

	it('defaults html to an empty string when the block has none', () => {
		expect(treeToNode(tree({ id: 'a', type: 'text', content: 'x' })).html).toBe('');
	});

	it('carries codeCollapsed so a pasted long code block keeps its preview state', () => {
		expect(treeToNode(tree({ id: 'a', type: 'code', content: 'x', codeCollapsed: true })).codeCollapsed).toBe(true);
		expect(treeToNode(tree({ id: 'b', type: 'text', content: 'y' })).codeCollapsed).toBe(false);
	});

	it('treeToNode carries dueDate (spec 021)', () => {
		const t = tree({ id: 'b1', type: 'text', content: 'a', dueDate: '2026-07-22' });
		expect(treeToNode(t).dueDate).toBe('2026-07-22');
		const bare = tree({ id: 'b2', type: 'text', content: 'a' });
		expect(treeToNode(bare).dueDate).toBeNull();
	});
});

describe('flattenNode', () => {
	it('returns nodes in pre-order (matching snippet materialisation)', () => {
		const node = {
			type: 'bullet',
			content: 'a',
			children: [
				{ type: 'bullet', content: 'b', children: [{ type: 'bullet', content: 'c', children: [] }] },
				{ type: 'bullet', content: 'd', children: [] }
			]
		};
		expect(flattenNode(node).map((n) => n.content)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('serialize/deserialize forest', () => {
	it('round-trips a forest, unicode included', () => {
		const forest = [
			{ type: 'code', content: 'const x = "café ☕";\nreturn x', checked: false, note: '', tags: [], children: [] },
			{ type: 'todo', content: 'hacer algo', checked: true, note: '', tags: ['casa'], children: [] }
		];
		expect(deserializeForest(serializeForest(forest))).toEqual(forest);
	});

	it('returns null for an empty or invalid payload', () => {
		expect(deserializeForest('')).toBeNull();
		expect(deserializeForest(undefined)).toBeNull();
		expect(deserializeForest('not json')).toBeNull();
		expect(deserializeForest('[]')).toBeNull();
	});
});

// The copy buffer holds real note text in localStorage (spec 030 phase 0), so
// it must not outlive its window. These tests run under the node project, which
// has no localStorage — a minimal in-memory stub stands in for it.
describe('copy buffer lifetime', () => {
	const STORE_KEY = 'copynotes:clipboard';
	let store;

	beforeEach(() => {
		store = new Map();
		globalThis.localStorage = {
			getItem: (k) => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => void store.set(k, String(v)),
			removeItem: (k) => void store.delete(k),
			clear: () => store.clear(),
			key: (i) => [...store.keys()][i] ?? null,
			get length() {
				return store.size;
			}
		};
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		delete globalThis.localStorage;
	});

	it('recalls a payload copied moments ago', () => {
		rememberCopy('hola', 'PAYLOAD');
		expect(recallCopy('hola')).toBe('PAYLOAD');
	});

	it('forgets — and erases — a payload older than the window', () => {
		rememberCopy('hola', 'PAYLOAD');
		vi.advanceTimersByTime(COPY_BUFFER_TTL_MS + 1);
		expect(recallCopy('hola')).toBeNull();
		expect(store.has(STORE_KEY)).toBe(false);
	});

	it('purges a stale entry at boot but keeps a fresh one', () => {
		rememberCopy('hola', 'PAYLOAD');
		purgeStaleCopy();
		expect(store.has(STORE_KEY)).toBe(true);
		vi.advanceTimersByTime(COPY_BUFFER_TTL_MS + 1);
		purgeStaleCopy();
		expect(store.has(STORE_KEY)).toBe(false);
	});

	// Entries written before this fix carry no timestamp. They are the ones most
	// likely to have been sitting on disk for months, so they must go on sight.
	it('treats a legacy entry with no timestamp as stale', () => {
		store.set(STORE_KEY, JSON.stringify({ text: 'hola', payload: 'PAYLOAD' }));
		expect(recallCopy('hola')).toBeNull();
		expect(store.has(STORE_KEY)).toBe(false);
	});

	it('survives a corrupted entry without throwing', () => {
		store.set(STORE_KEY, 'not json');
		expect(recallCopy('hola')).toBeNull();
		purgeStaleCopy();
		expect(store.has(STORE_KEY)).toBe(false);
	});
});
