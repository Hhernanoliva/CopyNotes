import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/storage';
import { listNotes, listBlocksByNote, listTags, listTagsFor } from '$lib/storage';
import { demoNoteTree, shouldSeedDemoNote, seedDemoNote, DEMO_TAG_NAME } from './demo-note';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

// Flattens the demo tree (parents before children) for shape assertions.
function flatten(nodes) {
	const out = [];
	for (const node of nodes) {
		out.push(node);
		if (node.children?.length) out.push(...flatten(node.children));
	}
	return out;
}

describe('shouldSeedDemoNote', () => {
	it('seeds only on a fresh, empty first run', () => {
		expect(shouldSeedDemoNote({ demoNoteCreated: false, noteCount: 0 })).toBe(true);
	});

	it('never re-seeds once the demo note was created, even with no notes left', () => {
		expect(shouldSeedDemoNote({ demoNoteCreated: true, noteCount: 0 })).toBe(false);
	});

	it('does not seed when the user already has notes', () => {
		expect(shouldSeedDemoNote({ demoNoteCreated: false, noteCount: 3 })).toBe(false);
	});
});

describe('demoNoteTree', () => {
	it('teaches every core block type', () => {
		const tree = demoNoteTree();
		expect(tree.title).toBeTruthy();

		const nodes = flatten(tree.blocks);
		const types = new Set(nodes.map((node) => node.type));
		expect(types.has('bullet')).toBe(true);
		expect(types.has('todo')).toBe(true);
		expect(types.has('code')).toBe(true);
		expect(types.has('separator')).toBe(true);

		// A nested bullet, both todo states, a tagged block, and a block note.
		expect(tree.blocks.some((node) => node.children?.length)).toBe(true);
		expect(nodes.some((node) => node.type === 'todo' && node.checked === true)).toBe(true);
		expect(nodes.some((node) => node.type === 'todo' && node.checked === false)).toBe(true);
		expect(nodes.some((node) => node.tag === DEMO_TAG_NAME)).toBe(true);
		expect(nodes.some((node) => node.note)).toBe(true);
	});
});

describe('seedDemoNote', () => {
	it('creates one note with the demo blocks, nesting, and tag', async () => {
		const note = await seedDemoNote();

		const allNotes = await listNotes();
		expect(allNotes).toHaveLength(1);
		expect(allNotes[0].id).toBe(note.id);

		const blocks = await listBlocksByNote(note.id);
		const roots = blocks.filter((block) => block.parentBlockId === null);
		const children = blocks.filter((block) => block.parentBlockId !== null);
		expect(roots.length).toBe(demoNoteTree().blocks.length);
		expect(children.length).toBeGreaterThan(0);

		// Children point at a real parent in the same note.
		const ids = new Set(blocks.map((block) => block.id));
		expect(children.every((block) => ids.has(block.parentBlockId))).toBe(true);

		// The demo tag exists and is assigned to exactly one block.
		const tags = await listTags();
		const demoTag = tags.find((tag) => tag.name === DEMO_TAG_NAME);
		expect(demoTag).toBeTruthy();
		const tagged = [];
		for (const block of blocks) {
			const blockTags = await listTagsFor('block', block.id);
			if (blockTags.some((tag) => tag.id === demoTag.id)) tagged.push(block.id);
		}
		expect(tagged).toHaveLength(1);
	});
});
