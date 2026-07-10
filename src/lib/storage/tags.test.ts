import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote } from './notes';
import {
	assignTag,
	createTag,
	getTag,
	listAssignmentsForTag,
	listTags,
	listTagsFor,
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
