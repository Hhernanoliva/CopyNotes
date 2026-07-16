import { describe, expect, it } from 'vitest';
import { planSnippetInsertion } from './insert';

function counterIds() {
	let next = 0;
	return () => `new-${next++}`;
}

function existingBlock(id, order, parentBlockId = null) {
	return { id, noteId: 'note-1', parentBlockId, type: 'text', content: id, order };
}

const textSnippet = { name: 'Saludo', content: 'Hola equipo', blockSnapshot: null };

const outlineSnippet = {
	name: 'Checklist',
	content: '- Checklist\n  - [ ] Backup\n  - [x] Deploy',
	blockSnapshot: {
		type: 'bullet',
		content: 'Checklist',
		checked: false,
		children: [
			{ type: 'todo', content: 'Backup', checked: false, children: [] },
			{ type: 'todo', content: 'Deploy', checked: true, children: [] }
		]
	}
};

describe('planSnippetInsertion', () => {
	it('inserts a text snippet as one text block after the target', () => {
		const blocks = [existingBlock('a', 0), existingBlock('b', 1)];
		const plan = planSnippetInsertion(blocks, textSnippet, {
			noteId: 'note-1',
			afterId: 'a',
			createId: counterIds()
		});
		expect(plan.newBlocks).toEqual([
			{
				id: 'new-0',
				noteId: 'note-1',
				parentBlockId: null,
				type: 'text',
				content: 'Hola equipo',
				html: 'Hola equipo',
				order: 1,
				collapsed: false,
				codeCollapsed: false,
				checked: false,
				note: ''
			}
		]);
		expect(plan.updates).toEqual([{ id: 'b', order: 2 }]);
		expect(plan.focusId).toBe('new-0');
	});

	it('preserves codeCollapsed from the snapshot and defaults it to false', () => {
		const blocks = [existingBlock('a', 0)];
		const codeSnippet = {
			name: 'Code',
			content: 'x',
			blockSnapshot: { type: 'code', content: 'x', codeCollapsed: true, children: [] }
		};
		const plan = planSnippetInsertion(blocks, codeSnippet, {
			noteId: 'note-1',
			afterId: 'a',
			createId: counterIds()
		});
		expect(plan.newBlocks[0].codeCollapsed).toBe(true);
	});

	it('backfills html from content when the snippet/snapshot has no html', () => {
		const blocks = [existingBlock('a', 0)];
		const plan = planSnippetInsertion(blocks, textSnippet, {
			noteId: 'note-1',
			afterId: 'a',
			createId: counterIds()
		});
		expect(plan.newBlocks[0].html).toBe(plan.newBlocks[0].content);

		const outlinePlan = planSnippetInsertion(blocks, outlineSnippet, {
			noteId: 'note-1',
			afterId: 'a',
			createId: counterIds()
		});
		for (const block of outlinePlan.newBlocks) {
			expect(block.html).toBe(block.content);
		}
	});

	it('recreates a snapshot as nested blocks with fresh ids', () => {
		const blocks = [existingBlock('a', 0)];
		const plan = planSnippetInsertion(blocks, outlineSnippet, {
			noteId: 'note-1',
			afterId: 'a',
			createId: counterIds()
		});
		expect(plan.newBlocks).toHaveLength(3);
		const [root, child1, child2] = plan.newBlocks;
		expect(root).toMatchObject({ type: 'bullet', content: 'Checklist', parentBlockId: null, order: 1 });
		expect(child1).toMatchObject({ type: 'todo', content: 'Backup', parentBlockId: root.id, order: 0, checked: false });
		expect(child2).toMatchObject({ type: 'todo', content: 'Deploy', parentBlockId: root.id, order: 1, checked: true });
		const ids = plan.newBlocks.map((block) => block.id);
		expect(new Set(ids).size).toBe(3);
	});

	it('appends at the end of the root level when there is no target block', () => {
		const blocks = [existingBlock('a', 0), existingBlock('b', 1)];
		const plan = planSnippetInsertion(blocks, textSnippet, {
			noteId: 'note-1',
			afterId: null,
			createId: counterIds()
		});
		expect(plan.newBlocks[0].order).toBe(2);
		expect(plan.updates).toEqual([]);
	});

	it('inserts as sibling inside the target level, not always at root', () => {
		const blocks = [
			existingBlock('parent', 0),
			existingBlock('child', 0, 'parent'),
			existingBlock('child2', 1, 'parent')
		];
		const plan = planSnippetInsertion(blocks, textSnippet, {
			noteId: 'note-1',
			afterId: 'child',
			createId: counterIds()
		});
		expect(plan.newBlocks[0].parentBlockId).toBe('parent');
		expect(plan.newBlocks[0].order).toBe(1);
		expect(plan.updates).toEqual([{ id: 'child2', order: 2 }]);
	});
});
