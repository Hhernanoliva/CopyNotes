import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote } from './notes';
import {
	assignTag,
	createTag,
	findOrCreateTag,
	getTag,
	renameTag,
	listAssignmentsForTag,
	listTags,
	listTagsFor,
	listAllAssignments,
	listTagsForMany,
	softDeleteTag,
	unassignTag,
	updateTag
} from './tags';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('tags repository', () => {
	it('creates and renames a tag', async () => {
		const tag = await createTag({ name: 'work' });
		const renamed = await updateTag(tag.id, { name: 'projects' });
		expect(renamed.name).toBe('projects');
	});

	it('assigns a tag to a note and reads it back', async () => {
		const note = await createNote();
		const tag = await createTag({ name: 'work' });

		await assignTag(tag.id, 'note', note.id);

		const tagsForNote = await listTagsFor('note', note.id);
		expect(tagsForNote.map((row) => row.id)).toEqual([tag.id]);
	});

	it('does not duplicate an active assignment', async () => {
		const note = await createNote();
		const tag = await createTag({ name: 'work' });

		const first = await assignTag(tag.id, 'note', note.id);
		const second = await assignTag(tag.id, 'note', note.id);

		expect(second.id).toBe(first.id);
		expect(await listAssignmentsForTag(tag.id)).toHaveLength(1);
	});

	it('unassign soft deletes the assignment only', async () => {
		const note = await createNote();
		const tag = await createTag({ name: 'work' });
		await assignTag(tag.id, 'note', note.id);

		await unassignTag(tag.id, 'note', note.id);

		expect(await listTagsFor('note', note.id)).toEqual([]);
		expect(await getTag(tag.id)).toBeTruthy();
	});

	it('soft deleted tags disappear from lists and lookups', async () => {
		const note = await createNote();
		const tag = await createTag({ name: 'old' });
		await assignTag(tag.id, 'note', note.id);

		await softDeleteTag(tag.id);

		expect(await listTags()).toEqual([]);
		expect(await listTagsFor('note', note.id)).toEqual([]);

		const raw = await db.table('tags').get(tag.id);
		expect(raw.deletedAt).toBeTruthy();
	});
});

describe('findOrCreateTag', () => {
	it('creates the tag on first use', async () => {
		const tag = await findOrCreateTag('  #Trabajo  ');
		expect(tag.name).toBe('Trabajo');
	});

	it('reuses an existing tag for case/accents/# variants', async () => {
		const first = await findOrCreateTag('Diseño');
		const again = await findOrCreateTag('#diseño');
		expect(again.id).toBe(first.id);
		expect(await listTags()).toHaveLength(1);
	});

	it('returns null for blank names', async () => {
		expect(await findOrCreateTag('   ')).toBe(null);
		expect(await listTags()).toHaveLength(0);
	});

	it('can revive a name that was soft-deleted as a fresh tag', async () => {
		const dead = await findOrCreateTag('viejo');
		await softDeleteTag(dead.id);
		const fresh = await findOrCreateTag('viejo');
		expect(fresh.id).not.toBe(dead.id);
	});
});

describe('renameTag', () => {
	it('renames when the new name is free', async () => {
		const tag = await findOrCreateTag('borrador');
		const renamed = await renameTag(tag.id, ' Ideas ');
		expect(renamed.name).toBe('Ideas');
	});

	it('rejects a rename that collides with another tag', async () => {
		await findOrCreateTag('personal');
		const tag = await findOrCreateTag('trabajo');
		const result = await renameTag(tag.id, '#Personal');
		expect(result).toBe(null);
		expect((await getTag(tag.id)).name).toBe('trabajo');
	});

	it('allows renaming a tag to a variant of itself', async () => {
		const tag = await findOrCreateTag('trabajo');
		const renamed = await renameTag(tag.id, 'Trabajo');
		expect(renamed.name).toBe('Trabajo');
	});

	it('rejects blank names', async () => {
		const tag = await findOrCreateTag('trabajo');
		expect(await renameTag(tag.id, '  ')).toBe(null);
	});
});

describe('listTagsForMany', () => {
	it('maps each target to its live tags', async () => {
		const note = await createNote();
		const work = await findOrCreateTag('trabajo');
		const ideas = await findOrCreateTag('ideas');
		await assignTag(work.id, 'block', 'b1');
		await assignTag(ideas.id, 'block', 'b1');
		await assignTag(work.id, 'block', 'b2');

		const map = await listTagsForMany('block', ['b1', 'b2', 'b3']);
		expect(map.b1.map((tag) => tag.name).sort()).toEqual(['ideas', 'trabajo']);
		expect(map.b2.map((tag) => tag.name)).toEqual(['trabajo']);
		expect(map.b3 ?? []).toEqual([]);
		void note;
	});

	it('excludes soft-deleted tags and assignments', async () => {
		const dead = await findOrCreateTag('muerta');
		const removed = await findOrCreateTag('sacada');
		await assignTag(dead.id, 'snippet', 's1');
		await assignTag(removed.id, 'snippet', 's1');
		await softDeleteTag(dead.id);
		await unassignTag(removed.id, 'snippet', 's1');

		const map = await listTagsForMany('snippet', ['s1']);
		expect(map.s1 ?? []).toEqual([]);
	});
});

describe('listAllAssignments', () => {
	it('returns live assignments only', async () => {
		const tag = await findOrCreateTag('viva');
		await assignTag(tag.id, 'note', 'n1');
		await assignTag(tag.id, 'block', 'b1');
		await unassignTag(tag.id, 'block', 'b1');

		const rows = await listAllAssignments();
		expect(rows).toHaveLength(1);
		expect(rows[0].targetType).toBe('note');
	});
});
