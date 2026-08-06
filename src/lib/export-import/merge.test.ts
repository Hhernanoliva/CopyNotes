import { describe, expect, it } from 'vitest';
import { planMerge } from './merge';
import { CURRENT_VERSION, SUPPORTED_FORMAT, validateBackup } from './schema';

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

// A backup file exactly as `storage/backup.ts` writes one, so a test can run the
// real file → validate → merge path instead of handing planMerge rows the
// validator never touched.
function makeBackupFile(data = {}) {
	const full = { ...emptyTables(), folders: [], activity: [], ...data };
	return {
		format: SUPPORTED_FORMAT,
		formatVersion: CURRENT_VERSION,
		exportedAt: iso,
		counts: Object.fromEntries(Object.entries(full).map(([name, rows]) => [name, rows.length])),
		data: full
	};
}

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

	// The duplicated note used to land EMPTY: its rows were identical to the local
	// ones, so they were skipped, and stayed attached to the local note.
	it('copies the rows of a duplicated note even when they are identical', () => {
		const local = {
			...emptyTables(),
			notes: [note('note_1', { title: 'Local' })],
			blocks: [block('block_1', 'note_1')]
		};
		const incoming = {
			...emptyTables(),
			notes: [note('note_1', { title: 'Importada', updatedAt: later })],
			blocks: [block('block_1', 'note_1')]
		};
		const plan = planMerge(local, incoming, { createId: nextId });
		const importedNote = plan.inserts.notes[0];
		expect(plan.inserts.blocks).toHaveLength(1);
		expect(plan.inserts.blocks[0].id).not.toBe('block_1');
		expect(plan.inserts.blocks[0].noteId).toBe(importedNote.id);
		expect(plan.summary.blocks.skipped).toBe(0);
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

	it('restores the agenda and demo-note preferences (spec 021)', () => {
		const incoming = {
			...emptyTables(),
			settings: [
				{ key: 'agendaHideCompleted', value: true, updatedAt: iso },
				{ key: 'demoNoteCreated', value: true, updatedAt: iso }
			]
		};
		const plan = planMerge(emptyTables(), incoming, { createId: nextId });
		expect(plan.settings.map((row) => row.key).sort()).toEqual([
			'agendaHideCompleted',
			'demoNoteCreated'
		]);
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

	describe('folders (spec 022)', () => {
		function folder(id, overrides = {}) {
			return {
				id,
				kind: 'note',
				name: 'Trabajo',
				sortOrder: 0,
				collapsed: false,
				createdAt: iso,
				updatedAt: iso,
				deletedAt: null,
				...overrides
			};
		}

		it('inserts new folders and remaps folderId on conflicted folder ids', () => {
			const local = { ...emptyTables(), folders: [folder('f1', { name: 'Distinto' })] };
			const incoming = {
				...emptyTables(),
				folders: [folder('f1')],
				notes: [note('n1', { folderId: 'f1', sortOrder: 0 })]
			};
			const plan = planMerge(local, incoming, { createId: () => 'fresh' });
			expect(plan.inserts.folders).toEqual([{ ...folder('f1'), id: 'fresh' }]);
			expect(plan.inserts.notes[0].folderId).toBe('fresh');
		});

		it('merging a v3 backup (no folders key) plans no folder inserts', () => {
			const plan = planMerge(emptyTables(), { ...emptyTables(), folders: undefined });
			expect(plan.inserts.folders).toEqual([]);
		});
	});

	// spec 030 phase 0: the bitácora is part of the backup now.
	describe('activity', () => {
		function activity(id, blockId, noteId, overrides = {}) {
			return {
				id,
				blockId,
				noteId,
				actor: 'user',
				action: 'done',
				text: '',
				seq: 0,
				at: iso,
				deletedAt: null,
				...overrides
			};
		}

		it('inserts incoming history lines', () => {
			const incoming = {
				...emptyTables(),
				notes: [note('n1')],
				blocks: [block('b1', 'n1')],
				activity: [activity('a1', 'b1', 'n1')]
			};
			const plan = planMerge(emptyTables(), incoming);
			expect(plan.inserts.activity).toHaveLength(1);
			expect(plan.summary.activity.added).toBe(1);
		});

		it('follows its task to the new id when the block was remapped', () => {
			const local = { ...emptyTables(), blocks: [block('b1', 'n1', { content: 'Distinto' })] };
			const incoming = {
				...emptyTables(),
				blocks: [block('b1', 'n1')],
				activity: [activity('a1', 'b1', 'n1')]
			};
			const plan = planMerge(local, incoming, { createId: () => 'fresh' });
			expect(plan.inserts.activity[0].blockId).toBe('fresh');
		});

		it('skips a history line that is already there', () => {
			const local = { ...emptyTables(), activity: [activity('a1', 'b1', 'n1')] };
			const incoming = { ...emptyTables(), activity: [activity('a1', 'b1', 'n1')] };
			const plan = planMerge(local, incoming);
			expect(plan.inserts.activity).toEqual([]);
			expect(plan.summary.activity.skipped).toBe(1);
		});

		it('merging an older backup with no activity key plans no inserts', () => {
			const plan = planMerge(emptyTables(), { ...emptyTables(), activity: undefined });
			expect(plan.inserts.activity).toEqual([]);
		});
	});

	// The whole point of "importar dos veces no duplica": validation runs on the
	// file before the merge sees it, so anything validation rewrites stops
	// matching its local twin. A note created at the top of the sidebar carries a
	// NEGATIVE sortOrder (storage/organize.ts), which is exactly what this used to
	// strip — turning every re-import of your own backup into a pile of copies.
	describe('importing your own backup twice', () => {
		it('does not duplicate a note whose position is negative', () => {
			const mine = note('n1', { sortOrder: -3, folderId: null });
			const file = makeBackupFile({ notes: [structuredClone(mine)] });

			const validated = validateBackup(file);
			expect(validated.ok).toBe(true);

			const plan = planMerge(
				{ ...emptyTables(), notes: [mine] },
				validated.backup.data
			);
			expect(plan.inserts.notes).toEqual([]);
			expect(plan.summary.notes.skipped).toBe(1);
		});
	});
});
