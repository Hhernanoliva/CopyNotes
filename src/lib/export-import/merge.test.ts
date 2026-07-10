import { describe, expect, it } from 'vitest';
import { planMerge } from './merge';

const iso = '2026-07-10T12:00:00.000Z';
const later = '2026-07-10T13:00:00.000Z';

function emptyTables() {
	return { notes: [], blocks: [], snippets: [], tags: [], tagAssignments: [], settings: [] };
}

function note(id, overrides = {}) {
	return { id, title: 'Nota', createdAt: iso, updatedAt: iso, deletedAt: null, ...overrides };
}

function block(id, noteId, overrides = {}) {
	return {
		id,
		noteId,
		parentBlockId: null,
		type: 'bullet',
		content: 'Hola',
		order: 1000,
		collapsed: false,
		checked: false,
		createdAt: iso,
		updatedAt: iso,
		deletedAt: null,
		...overrides
	};
}

function tag(id, overrides = {}) {
	return { id, name: 'demo', createdAt: iso, updatedAt: iso, deletedAt: null, ...overrides };
}

function assignment(id, tagId, targetType, targetId, overrides = {}) {
	return { id, tagId, targetType, targetId, createdAt: iso, updatedAt: iso, deletedAt: null, ...overrides };
}

let counter = 0;
const nextId = () => `new_${++counter}`;

describe('planMerge', () => {
	it('inserts everything into an empty database', () => {
		const incoming = {
			...emptyTables(),
			notes: [note('note_1')],
			blocks: [block('block_1', 'note_1')],
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		};
		const plan = planMerge(emptyTables(), incoming, { createId: nextId });
		expect(plan.inserts.notes).toHaveLength(1);
		expect(plan.inserts.blocks).toHaveLength(1);
		expect(plan.settings).toHaveLength(1);
		expect(plan.summary.conflicts).toBe(0);
	});

	it('skips records that already exist identically', () => {
		const shared = note('note_1');
		const plan = planMerge(
			{ ...emptyTables(), notes: [shared] },
			{ ...emptyTables(), notes: [note('note_1')] },
			{ createId: nextId }
		);
		expect(plan.inserts.notes).toHaveLength(0);
		expect(plan.summary.notes.skipped).toBe(1);
		expect(plan.summary.conflicts).toBe(0);
	});

	it('preserves both versions when a note id conflicts, remapping its blocks', () => {
		const local = { ...emptyTables(), notes: [note('note_1', { title: 'Local' })] };
		const incoming = {
			...emptyTables(),
			notes: [note('note_1', { title: 'Importada', updatedAt: later })],
			blocks: [block('block_1', 'note_1')]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		expect(plan.inserts.notes).toHaveLength(1);
		const importedNote = plan.inserts.notes[0];
		expect(importedNote.id).not.toBe('note_1');
		expect(importedNote.title).toBe('Importada');
		expect(plan.inserts.blocks[0].noteId).toBe(importedNote.id);
		expect(plan.summary.conflicts).toBe(1);
	});

	it('remaps children and tag assignments when a block id conflicts', () => {
		const local = {
			...emptyTables(),
			notes: [note('note_1')],
			blocks: [block('block_1', 'note_1', { content: 'Local' })]
		};
		const incoming = {
			...emptyTables(),
			blocks: [
				block('block_1', 'note_1', { content: 'Importado' }),
				block('block_2', 'note_1', { parentBlockId: 'block_1' })
			],
			tags: [tag('tag_1')],
			tagAssignments: [assignment('ta_1', 'tag_1', 'block', 'block_1')]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		const importedParent = plan.inserts.blocks.find((row) => row.content === 'Importado');
		expect(importedParent.id).not.toBe('block_1');
		const child = plan.inserts.blocks.find((row) => row.id === 'block_2');
		expect(child.parentBlockId).toBe(importedParent.id);
		expect(plan.inserts.tagAssignments[0].targetId).toBe(importedParent.id);
	});

	it('remaps tag assignments when a tag id conflicts', () => {
		const local = { ...emptyTables(), tags: [tag('tag_1', { name: 'local' })] };
		const incoming = {
			...emptyTables(),
			notes: [note('note_1')],
			tags: [tag('tag_1', { name: 'importada' })],
			tagAssignments: [assignment('ta_1', 'tag_1', 'note', 'note_1')]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		const importedTag = plan.inserts.tags[0];
		expect(importedTag.id).not.toBe('tag_1');
		expect(plan.inserts.tagAssignments[0].tagId).toBe(importedTag.id);
	});

	it('does not duplicate an assignment linking the same tag and target', () => {
		const local = {
			...emptyTables(),
			notes: [note('note_1')],
			tags: [tag('tag_1')],
			tagAssignments: [assignment('ta_local', 'tag_1', 'note', 'note_1')]
		};
		const incoming = {
			...emptyTables(),
			tagAssignments: [assignment('ta_other', 'tag_1', 'note', 'note_1')]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		expect(plan.inserts.tagAssignments).toHaveLength(0);
	});

	it('applies only settings that do not exist locally', () => {
		const local = {
			...emptyTables(),
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		};
		const incoming = {
			...emptyTables(),
			settings: [
				{ key: 'theme', value: 'light', updatedAt: later },
				{ key: 'hasCompletedOnboarding', value: true, updatedAt: later }
			]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		expect(plan.settings).toHaveLength(1);
		expect(plan.settings[0].key).toBe('hasCompletedOnboarding');
		expect(plan.summary.settings.skipped).toBe(1);
	});

	it('ignores settings outside the safe whitelist', () => {
		const incoming = {
			...emptyTables(),
			settings: [
				{ key: 'theme', value: 'dark', updatedAt: iso },
				{ key: 'apiToken', value: 'secreto', updatedAt: iso }
			]
		};
		const plan = planMerge(emptyTables(), incoming, { createId: nextId });
		expect(plan.settings.map((row) => row.key)).toEqual(['theme']);
	});

	it('summarizes what will be added', () => {
		const incoming = {
			...emptyTables(),
			notes: [note('note_1')],
			blocks: [block('block_1', 'note_1')],
			tags: [tag('tag_1')]
		};
		const plan = planMerge(emptyTables(), incoming, { createId: nextId });
		expect(plan.summary.notes.added).toBe(1);
		expect(plan.summary.blocks.added).toBe(1);
		expect(plan.summary.tags.added).toBe(1);
		expect(plan.summary.remapped).toBe(false);
	});
});
