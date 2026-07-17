import { describe, expect, it } from 'vitest';
import { validateBackup } from './schema';

const iso = '2026-07-10T12:00:00.000Z';

function makeNote(overrides = {}) {
	return {
		id: 'note_1',
		title: 'Demo',
		createdAt: iso,
		updatedAt: iso,
		deletedAt: null,
		...overrides
	};
}

function makeBlock(overrides = {}) {
	return {
		id: 'block_1',
		noteId: 'note_1',
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

function makeBackup(data = {}, overrides = {}) {
	const full = {
		notes: [],
		blocks: [],
		snippets: [],
		tags: [],
		tagAssignments: [],
		settings: [],
		...data
	};
	return {
		format: 'copynotes.backup',
		formatVersion: 1,
		app: { name: 'CopyNotes', version: '0.0.1' },
		exportedAt: iso,
		exportedBy: { source: 'pwa' },
		counts: {
			notes: full.notes.length,
			blocks: full.blocks.length,
			snippets: full.snippets.length,
			tags: full.tags.length,
			tagAssignments: full.tagAssignments.length,
			settings: full.settings.length
		},
		data: full,
		...overrides
	};
}

describe('validateBackup', () => {
	it('keeps the long-code preview state in a valid backup', () => {
		const result = validateBackup(
			makeBackup({
				notes: [makeNote()],
				blocks: [makeBlock({ type: 'code', codeCollapsed: true })]
			})
		);
		expect(result.ok).toBe(true);
		expect(result.backup.data.blocks[0].codeCollapsed).toBe(true);
	});

	it('accepts a valid backup with nested blocks, tags, and settings', () => {
		const backup = makeBackup({
			notes: [makeNote()],
			blocks: [makeBlock(), makeBlock({ id: 'block_2', parentBlockId: 'block_1', type: 'todo' })],
			tags: [{ id: 'tag_1', name: 'demo', createdAt: iso, updatedAt: iso, deletedAt: null }],
			tagAssignments: [
				{
					id: 'ta_1',
					tagId: 'tag_1',
					targetType: 'note',
					targetId: 'note_1',
					createdAt: iso,
					updatedAt: iso,
					deletedAt: null
				}
			],
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		});
		const result = validateBackup(backup);
		expect(result.ok).toBe(true);
		expect(result.backup.data.notes).toHaveLength(1);
		expect(result.warnings).toEqual([]);
	});

	it('rejects values that are not a backup object', () => {
		expect(validateBackup(null).ok).toBe(false);
		expect(validateBackup('hola').ok).toBe(false);
		expect(validateBackup([1, 2]).ok).toBe(false);
	});

	it('rejects a wrong format marker', () => {
		const result = validateBackup(makeBackup({}, { format: 'otra.app' }));
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('rejects an unsupported formatVersion with a clear message', () => {
		const result = validateBackup(makeBackup({}, { formatVersion: 99 }));
		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/versión|version/i);
	});

	it('rejects a backup missing required data arrays', () => {
		const backup = makeBackup();
		delete backup.data.blocks;
		expect(validateBackup(backup).ok).toBe(false);
	});

	it('accepts heading blocks of the three levels', () => {
		const result = validateBackup(
			makeBackup({
				notes: [makeNote()],
				blocks: [
					makeBlock({ type: 'heading1' }),
					makeBlock({ id: 'block_2', type: 'heading2' }),
					makeBlock({ id: 'block_3', type: 'heading3' })
				]
			})
		);
		expect(result.ok).toBe(true);
	});

	it('accepts formatVersion 2 backups', () => {
		const result = validateBackup(
			makeBackup({ notes: [makeNote()] }, { formatVersion: 2 })
		);
		expect(result.ok).toBe(true);
	});

	it('still accepts formatVersion 1 backups', () => {
		const result = validateBackup(makeBackup({ notes: [makeNote()] }, { formatVersion: 1 }));
		expect(result.ok).toBe(true);
	});

	it('rejects a block with an unknown type', () => {
		const result = validateBackup(
			makeBackup({ notes: [makeNote()], blocks: [makeBlock({ type: 'heading' })] })
		);
		expect(result.ok).toBe(false);
	});

	it('rejects invalid timestamps', () => {
		const result = validateBackup(makeBackup({ notes: [makeNote({ createdAt: 'ayer' })] }));
		expect(result.ok).toBe(false);
	});

	it('rejects a block whose noteId points nowhere', () => {
		const result = validateBackup(makeBackup({ blocks: [makeBlock({ noteId: 'note_missing' })] }));
		expect(result.ok).toBe(false);
	});

	it('accepts a block whose noteId exists locally instead of in the backup', () => {
		const result = validateBackup(makeBackup({ blocks: [makeBlock({ noteId: 'note_local' })] }), {
			existingNoteIds: ['note_local']
		});
		expect(result.ok).toBe(true);
	});

	it('rejects a block whose parentBlockId points nowhere', () => {
		const result = validateBackup(
			makeBackup({ notes: [makeNote()], blocks: [makeBlock({ parentBlockId: 'block_missing' })] })
		);
		expect(result.ok).toBe(false);
	});

	it('rejects a tag assignment with an unknown targetType', () => {
		const result = validateBackup(
			makeBackup({
				tags: [{ id: 'tag_1', name: 'demo', createdAt: iso, updatedAt: iso, deletedAt: null }],
				tagAssignments: [
					{
						id: 'ta_1',
						tagId: 'tag_1',
						targetType: 'folder',
						targetId: 'x',
						createdAt: iso,
						updatedAt: iso,
						deletedAt: null
					}
				]
			})
		);
		expect(result.ok).toBe(false);
	});

	it('rejects a tag assignment pointing to a missing tag', () => {
		const result = validateBackup(
			makeBackup({
				notes: [makeNote()],
				tagAssignments: [
					{
						id: 'ta_1',
						tagId: 'tag_missing',
						targetType: 'note',
						targetId: 'note_1',
						createdAt: iso,
						updatedAt: iso,
						deletedAt: null
					}
				]
			})
		);
		expect(result.ok).toBe(false);
	});

	it('accepts mismatched counts but reports a warning and recalculates', () => {
		const backup = makeBackup({ notes: [makeNote()] });
		backup.counts.notes = 5;
		const result = validateBackup(backup);
		expect(result.ok).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.backup.counts.notes).toBe(1);
	});

	it('accepts a block with a string html field', () => {
		const result = validateBackup(
			makeBackup({ notes: [makeNote()], blocks: [makeBlock({ html: '<strong>Hola</strong>' })] })
		);
		expect(result.ok).toBe(true);
	});

	it('rejects a block whose html is not a string', () => {
		const result = validateBackup(
			makeBackup({ notes: [makeNote()], blocks: [makeBlock({ html: { evil: true } })] })
		);
		expect(result.ok).toBe(false);
	});

	function makeSnippet(overrides = {}) {
		return {
			id: 'snip_1',
			name: 'Firma',
			content: 'Saludos',
			isFavorite: false,
			createdAt: iso,
			updatedAt: iso,
			deletedAt: null,
			...overrides
		};
	}

	it('accepts a snippet without blockSnapshot (old backups)', () => {
		const result = validateBackup(makeBackup({ snippets: [makeSnippet()] }));
		expect(result.ok).toBe(true);
	});

	it('accepts a snippet with a nested blockSnapshot', () => {
		const snapshot = {
			type: 'bullet',
			content: 'padre',
			html: 'padre',
			checked: false,
			note: '',
			children: [{ type: 'todo', content: 'hijo', html: 'hijo', checked: true, note: '', children: [] }]
		};
		const result = validateBackup(
			makeBackup({ snippets: [makeSnippet({ blockSnapshot: snapshot })] })
		);
		expect(result.ok).toBe(true);
	});

	it('rejects a blockSnapshot that is not an object', () => {
		const result = validateBackup(
			makeBackup({ snippets: [makeSnippet({ blockSnapshot: 'texto suelto' })] })
		);
		expect(result.ok).toBe(false);
	});

	it('rejects a blockSnapshot node whose children is not an array', () => {
		const snapshot = { type: 'text', content: 'x', children: 'nope' };
		const result = validateBackup(
			makeBackup({ snippets: [makeSnippet({ blockSnapshot: snapshot })] })
		);
		expect(result.ok).toBe(false);
	});

	describe('formatVersion 3 / dueDate (spec 021)', () => {
		it('accepts version 3 with and without dueDate', () => {
			const backup = makeBackup(
				{ notes: [makeNote()], blocks: [makeBlock()] },
				{ formatVersion: 3 }
			);
			backup.data.blocks[0].dueDate = '2026-07-22';
			expect(validateBackup(backup).ok).toBe(true);
			delete backup.data.blocks[0].dueDate;
			expect(validateBackup(backup).ok).toBe(true);
		});
		it('rejects a malformed dueDate', () => {
			const backup = makeBackup(
				{ notes: [makeNote()], blocks: [makeBlock()] },
				{ formatVersion: 3 }
			);
			backup.data.blocks[0].dueDate = '22/07/2026';
			expect(validateBackup(backup).ok).toBe(false);
		});
		it('still rejects unsupported future versions', () => {
			const backup = makeBackup({}, { formatVersion: 5 });
			expect(validateBackup(backup).ok).toBe(false);
		});
	});

	describe('backup v4 organization fields (spec 022)', () => {
		function makeFolder(overrides = {}) {
			return {
				id: 'f1',
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

		it('accepts v4 with folders and organization fields', () => {
			const backup = makeBackup(
				{
					notes: [makeNote({ sortOrder: 0, folderId: 'f1' })],
					folders: [makeFolder()]
				},
				{ formatVersion: 4 }
			);
			const result = validateBackup(backup);
			expect(result.ok).toBe(true);
			expect(result.backup.data.folders).toHaveLength(1);
			expect(result.backup.data.notes[0].folderId).toBe('f1');
		});

		it('older backups without folders still validate and get an empty folders array', () => {
			const result = validateBackup(makeBackup({ notes: [makeNote()] }));
			expect(result.ok).toBe(true);
			expect(result.backup.data.folders).toEqual([]);
		});

		it('drops malformed sortOrder and orphan folderId instead of rejecting', () => {
			const backup = makeBackup(
				{ notes: [makeNote({ sortOrder: -3, folderId: 'ghost' })], folders: [] },
				{ formatVersion: 4 }
			);
			const result = validateBackup(backup);
			expect(result.ok).toBe(true);
			expect(result.backup.data.notes[0].sortOrder).toBeUndefined();
			expect(result.backup.data.notes[0].folderId).toBeNull();
			expect(result.warnings.length).toBeGreaterThan(0);
		});

		it('folderId pointing at a folder of the other kind is nulled', () => {
			const backup = makeBackup(
				{
					notes: [makeNote({ folderId: 'f1' })],
					folders: [makeFolder({ kind: 'snippet', name: 'X' })]
				},
				{ formatVersion: 4 }
			);
			const result = validateBackup(backup);
			expect(result.ok).toBe(true);
			expect(result.backup.data.notes[0].folderId).toBeNull();
		});
	});
});
