import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote, softDeleteNote } from './notes';
import { createBlock } from './blocks';
import { createTag, assignTag, listTagsFor } from './tags';
import { setSetting, getSetting } from './settings';
import { dumpAllTables, applyMergePlan, replaceAllTables } from './backup';
import { buildBackup } from '../export-import/backup';
import { validateBackup } from '../export-import/schema';
import { planMerge } from '../export-import/merge';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

const iso = '2026-07-10T12:00:00.000Z';

function emptyTables() {
	return { notes: [], blocks: [], snippets: [], tags: [], tagAssignments: [], settings: [] };
}

describe('dumpAllTables', () => {
	it('returns every table including soft-deleted rows', async () => {
		const kept = await createNote({ title: 'Viva' });
		const gone = await createNote({ title: 'Borrada' });
		await softDeleteNote(gone.id);
		const dump = await dumpAllTables();
		expect(dump.notes.map((note) => note.id).sort()).toEqual([kept.id, gone.id].sort());
		expect(dump.blocks).toEqual([]);
		expect(dump.settings).toEqual([]);
	});
});

describe('applyMergePlan', () => {
	it('inserts planned rows and applies settings', async () => {
		const plan = {
			inserts: {
				...emptyTables(),
				notes: [{ id: 'note_1', title: 'Importada', createdAt: iso, updatedAt: iso, deletedAt: null }]
			},
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		};
		delete plan.inserts.settings;
		await applyMergePlan(plan);
		expect((await db.table('notes').get('note_1')).title).toBe('Importada');
		expect(await getSetting('theme')).toBe('dark');
	});

	it('writes nothing if one insert fails', async () => {
		await db.table('notes').add({ id: 'note_dup', title: 'Local', createdAt: iso, updatedAt: iso, deletedAt: null });
		const plan = {
			inserts: {
				...emptyTables(),
				tags: [{ id: 'tag_1', name: 'demo', createdAt: iso, updatedAt: iso, deletedAt: null }],
				notes: [{ id: 'note_dup', title: 'Choque', createdAt: iso, updatedAt: iso, deletedAt: null }]
			},
			settings: []
		};
		delete plan.inserts.settings;
		await expect(applyMergePlan(plan)).rejects.toThrow();
		expect(await db.table('tags').count()).toBe(0);
		expect((await db.table('notes').get('note_dup')).title).toBe('Local');
	});
});

describe('replaceAllTables', () => {
	it('clears existing data and installs the incoming tables', async () => {
		await createNote({ title: 'Vieja' });
		await setSetting('theme', 'light');
		await replaceAllTables({
			...emptyTables(),
			notes: [{ id: 'note_new', title: 'Nueva', createdAt: iso, updatedAt: iso, deletedAt: null }],
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		});
		const notes = await db.table('notes').toArray();
		expect(notes).toHaveLength(1);
		expect(notes[0].id).toBe('note_new');
		expect(await getSetting('theme')).toBe('dark');
	});
});

describe('backup roundtrip', () => {
	it('export → clear → import restores notes, nested blocks, and tags', async () => {
		const note = await createNote({ title: 'Proyecto' });
		const parent = await createBlock({ noteId: note.id, type: 'bullet', content: 'Padre' });
		await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'Hijo'
		});
		const tag = await createTag({ name: 'demo' });
		await assignTag(tag.id, 'note', note.id);
		await setSetting('theme', 'dark');

		const backup = buildBackup(await dumpAllTables(), {
			appVersion: '0.0.1',
			exportedAt: iso
		});
		const validated = validateBackup(JSON.parse(JSON.stringify(backup)));
		expect(validated.ok).toBe(true);

		await Promise.all(db.tables.map((table) => table.clear()));

		const plan = planMerge(await dumpAllTables(), validated.backup.data);
		await applyMergePlan(plan);

		expect((await db.table('notes').get(note.id)).title).toBe('Proyecto');
		const blocks = await db.table('blocks').where('noteId').equals(note.id).toArray();
		expect(blocks).toHaveLength(2);
		expect(blocks.find((row) => row.content === 'Hijo').parentBlockId).toBe(parent.id);
		const tagsOnNote = await listTagsFor('note', note.id);
		expect(tagsOnNote.map((row) => row.name)).toEqual(['demo']);
		expect(await getSetting('theme')).toBe('dark');
	});
});
