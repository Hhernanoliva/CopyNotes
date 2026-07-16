import { describe, expect, it } from 'vitest';
import { snapshotFromBlocks, snippetFieldsFromBlocks, snippetFieldsFromText } from './snapshot';

function block(fields) {
	return {
		id: fields.id,
		noteId: 'note-1',
		parentBlockId: fields.parentBlockId ?? null,
		type: fields.type ?? 'text',
		content: fields.content ?? '',
		html: fields.html,
		order: fields.order ?? 0,
		collapsed: fields.collapsed ?? false,
		checked: fields.checked ?? false,
		dueDate: fields.dueDate ?? null,
		note: fields.note ?? ''
	};
}

describe('snapshotFromBlocks', () => {
	it('captures the root block with type, content and checked, without ids', () => {
		const blocks = [block({ id: 'a', type: 'todo', content: 'Llamar cliente', checked: true })];
		const snapshot = snapshotFromBlocks(blocks, 'a');
		expect(snapshot).toEqual({
			type: 'todo',
			content: 'Llamar cliente',
			html: '',
			checked: true,
			dueDate: null,
			note: '',
			children: []
		});
	});

	it('captures nested descendants sorted by order', () => {
		const blocks = [
			block({ id: 'root', type: 'bullet', content: 'Padre' }),
			block({ id: 'c2', parentBlockId: 'root', type: 'bullet', content: 'Segundo', order: 1 }),
			block({ id: 'c1', parentBlockId: 'root', type: 'bullet', content: 'Primero', order: 0 }),
			block({ id: 'g1', parentBlockId: 'c1', type: 'todo', content: 'Nieto', order: 0 })
		];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.children.map((child) => child.content)).toEqual(['Primero', 'Segundo']);
		expect(snapshot.children[0].children[0]).toEqual({
			type: 'todo',
			content: 'Nieto',
			html: '',
			checked: false,
			dueDate: null,
			note: '',
			children: []
		});
	});

	it('includes descendants of collapsed blocks', () => {
		const blocks = [
			block({ id: 'root', type: 'bullet', content: 'Padre', collapsed: true }),
			block({ id: 'c1', parentBlockId: 'root', type: 'bullet', content: 'Oculto', order: 0 })
		];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.children).toHaveLength(1);
	});

	it('ignores blocks outside the root subtree', () => {
		const blocks = [
			block({ id: 'root', type: 'bullet', content: 'Padre' }),
			block({ id: 'other', type: 'bullet', content: 'Ajeno', order: 1 })
		];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.children).toEqual([]);
	});
});

describe('snippetFieldsFromBlocks', () => {
	it('builds name, plain text content, snapshot and source ids', () => {
		const blocks = [
			block({ id: 'root', type: 'bullet', content: 'Checklist deploy' }),
			block({ id: 'c1', parentBlockId: 'root', type: 'todo', content: 'Backup', order: 0 })
		];
		const fields = snippetFieldsFromBlocks(blocks, 'root', 'note-1');
		expect(fields.name).toBe('Checklist deploy');
		expect(fields.content).toBe('- Checklist deploy\n  - [ ] Backup');
		expect(fields.blockSnapshot.children).toHaveLength(1);
		expect(fields.sourceNoteId).toBe('note-1');
		expect(fields.sourceBlockId).toBe('root');
	});

	it('falls back to a generic name when the root has no text', () => {
		const blocks = [block({ id: 'root', type: 'separator', content: '' })];
		const fields = snippetFieldsFromBlocks(blocks, 'root', 'note-1');
		expect(fields.name).toBe('Snippet');
	});

	it('caps long names', () => {
		const blocks = [block({ id: 'root', type: 'text', content: 'x'.repeat(100) })];
		const fields = snippetFieldsFromBlocks(blocks, 'root', 'note-1');
		expect(fields.name).toHaveLength(60);
	});
});

describe('snippetFieldsFromText', () => {
	it('uses the first line as name and keeps the full text as content', () => {
		const fields = snippetFieldsFromText('Hola equipo\nGracias por escribir');
		expect(fields.name).toBe('Hola equipo');
		expect(fields.content).toBe('Hola equipo\nGracias por escribir');
		expect(fields.blockSnapshot).toBe(null);
	});

	it('trims whitespace and falls back on empty text', () => {
		const fields = snippetFieldsFromText('   \n');
		expect(fields.name).toBe('Snippet');
		expect(fields.content).toBe('');
	});
});

describe('snapshot captures block notes', () => {
	it('keeps the note on each snapshot node', () => {
		const blocks = [block({ id: 'root', type: 'bullet', content: 'Padre', note: 'una aclaración' })];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.note).toBe('una aclaración');
	});
});

describe('snapshot captures block html', () => {
	it('carries the real sanitized html through, when present', () => {
		const blocks = [
			block({ id: 'root', type: 'text', content: 'hola', html: '<strong>hola</strong>' })
		];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.html).toBe('<strong>hola</strong>');
	});

	it('defaults html to an empty string when the block has none', () => {
		const blocks = [block({ id: 'root', type: 'text', content: 'x' })];
		const snapshot = snapshotFromBlocks(blocks, 'root');
		expect(snapshot.html).toBe('');
	});

	it('snapshotFromBlocks carries dueDate (spec 021)', () => {
		const blocks = [block({ id: 'a', type: 'text', content: 'x', dueDate: '2026-07-22' })];
		const snapshot = snapshotFromBlocks(blocks, 'a');
		expect(snapshot.dueDate).toBe('2026-07-22');
	});
});
