import { describe, expect, it } from 'vitest';
import { normalizeForest, normalizeSnapshotNode, sanitizeBackupData } from './ingest';

function node(overrides = {}) {
	return {
		type: 'text',
		content: 'hola',
		html: 'hola',
		checked: false,
		codeCollapsed: false,
		dueDate: null,
		note: '',
		tags: [],
		children: [],
		...overrides
	};
}

describe('normalizeForest', () => {
	it('returns null for anything that is not a non-empty array', () => {
		expect(normalizeForest(null)).toBeNull();
		expect(normalizeForest('x')).toBeNull();
		expect(normalizeForest([])).toBeNull();
		expect(normalizeForest({})).toBeNull();
	});

	it('returns null when no entry is a usable node', () => {
		expect(normalizeForest(['x', 42, null])).toBeNull();
	});

	it('passes a well-formed node through intact', () => {
		const clean = normalizeForest([node({ html: '<strong>hola</strong>' })]);
		expect(clean).toEqual([node({ html: '<strong>hola</strong>' })]);
	});

	it('sanitizes dangerous html down to the allowed subset', () => {
		const clean = normalizeForest([
			node({ html: '<img src=x onerror="alert(1)"><strong>hola</strong>' })
		]);
		expect(clean[0].html).toBe('<strong>hola</strong>');
	});

	it('drops html that is not a string, letting render fall back to content', () => {
		const clean = normalizeForest([node({ html: { evil: true } })]);
		expect(clean[0].html).toBe('');
	});

	it('coerces an unknown block type to text', () => {
		const clean = normalizeForest([node({ type: 'wormhole' })]);
		expect(clean[0].type).toBe('text');
	});

	it('keeps every real block type', () => {
		const types = ['text', 'bullet', 'todo', 'code', 'separator', 'heading1', 'heading2', 'heading3'];
		const clean = normalizeForest(types.map((type) => node({ type })));
		expect(clean.map((n) => n.type)).toEqual(types);
	});

	it('replaces non-string content and note with empty strings', () => {
		const clean = normalizeForest([node({ content: 42, note: ['x'] })]);
		expect(clean[0].content).toBe('');
		expect(clean[0].note).toBe('');
	});

	it('coerces checked and codeCollapsed to booleans', () => {
		const clean = normalizeForest([node({ checked: 'yes', codeCollapsed: 1 })]);
		expect(clean[0].checked).toBe(true);
		expect(clean[0].codeCollapsed).toBe(true);
	});

	it('keeps only string tags', () => {
		const clean = normalizeForest([node({ tags: ['a', 5, null, 'b'] })]);
		expect(clean[0].tags).toEqual(['a', 'b']);
	});

	it('repairs a missing or malformed children field to an empty array', () => {
		const bare = node();
		delete bare.children;
		expect(normalizeForest([bare])[0].children).toEqual([]);
		expect(normalizeForest([node({ children: 'x' })])[0].children).toEqual([]);
	});

	it('normalizes children recursively and drops garbage entries', () => {
		const clean = normalizeForest([
			node({ children: ['junk', node({ html: '<script>x</script>hijo' })] })
		]);
		expect(clean[0].children).toHaveLength(1);
		expect(clean[0].children[0].html).toBe('xhijo');
	});
});

describe('dueDate ingest (spec 021)', () => {
	it('keeps a valid dueDate', () => {
		const forest = normalizeForest([{ type: 'text', content: 'a', dueDate: '2026-07-22', children: [] }]);
		expect(forest[0].dueDate).toBe('2026-07-22');
	});
	it('drops malformed dueDate values', () => {
		for (const bad of ['22/07/2026', '2026-02-30', 42, {}, null]) {
			const forest = normalizeForest([{ type: 'text', content: 'a', dueDate: bad, children: [] }]);
			expect(forest[0].dueDate).toBeNull();
		}
	});
});

describe('sanitizeBackupData', () => {
	const data = (overrides = {}) => ({
		notes: [],
		blocks: [],
		snippets: [],
		tags: [],
		tagAssignments: [],
		settings: [],
		...overrides
	});

	it('sanitizes the html of every block', () => {
		const clean = sanitizeBackupData(
			data({ blocks: [{ id: 'b1', content: 'hola', html: '<img onerror="x"><em>hola</em>' }] })
		);
		expect(clean.blocks[0].html).toBe('<em>hola</em>');
		expect(clean.blocks[0].id).toBe('b1');
	});

	it('leaves blocks without html untouched (old backups)', () => {
		const block = { id: 'b1', content: 'hola' };
		const clean = sanitizeBackupData(data({ blocks: [block] }));
		expect(clean.blocks[0]).toEqual(block);
	});

	it('normalizes snippet blockSnapshots and sanitizes snippet html', () => {
		const clean = sanitizeBackupData(
			data({
				snippets: [
					{
						id: 's1',
						content: 'x',
						html: '<script>a</script>b',
						blockSnapshot: { type: 'text', content: 'x', html: '<u onclick="y">x</u>', children: [] }
					}
				]
			})
		);
		expect(clean.snippets[0].html).toBe('ab');
		expect(clean.snippets[0].blockSnapshot.html).toBe('<u>x</u>');
	});

	it('does not touch the other tables', () => {
		const input = data({ notes: [{ id: 'n1', title: 'T' }] });
		expect(sanitizeBackupData(input).notes).toEqual(input.notes);
	});
});

describe('normalizeSnapshotNode', () => {
	it('returns null for a non-object', () => {
		expect(normalizeSnapshotNode(null)).toBeNull();
		expect(normalizeSnapshotNode('x')).toBeNull();
	});

	it('normalizes a single snapshot node like a forest entry', () => {
		const clean = normalizeSnapshotNode(node({ html: '<em onclick="x">a</em>' }));
		expect(clean.html).toBe('<em>a</em>');
	});
});
