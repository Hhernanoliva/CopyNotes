import { db } from './db';
import { createId, now } from './ids';
import { normalizeTagName, tagNamesMatch } from '../tags/names';
import { sortBySidebarOrder } from '../organize';
import { shiftRootDown } from './organize';

const tags = db.table('tags');
const tagAssignments = db.table('tagAssignments');

export async function createTag(fields) {
	const { name, color = null } = fields;
	await shiftRootDown('tag');
	const timestamp = now();
	const tag = {
		id: createId(),
		name,
		color,
		sortOrder: 0,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await tags.add(tag);
	return tag;
}

// "Trabajo", "#trabajo" and "trabajo " are one tag: reuse the live match if
// it exists, create otherwise. Blank names never become tags.
export async function findOrCreateTag(name) {
	const clean = normalizeTagName(name);
	if (!clean) return null;
	const existing = (await listTags()).find((tag) => tagNamesMatch(tag.name, clean));
	if (existing) return existing;
	return createTag({ name: clean });
}

// Rename fails (returns null) on blank names or a collision with another
// live tag; renaming a tag to a variant of itself is allowed.
export async function renameTag(id, name) {
	const clean = normalizeTagName(name);
	if (!clean) return null;
	const collision = (await listTags()).find(
		(tag) => tag.id !== id && tagNamesMatch(tag.name, clean)
	);
	if (collision) return null;
	return updateTag(id, { name: clean });
}

export async function getTag(id) {
	const tag = await tags.get(id);
	if (!tag || tag.deletedAt) return undefined;
	return tag;
}

export async function listTags() {
	const rows = await tags.filter((tag) => !tag.deletedAt).toArray();
	return sortBySidebarOrder(rows);
}

export async function updateTag(id, changes) {
	await tags.update(id, { ...changes, updatedAt: now() });
	return tags.get(id);
}

export async function softDeleteTag(id) {
	const timestamp = now();
	await tags.update(id, { deletedAt: timestamp, updatedAt: timestamp });
}

export async function assignTag(tagId, targetType, targetId) {
	const existing = await tagAssignments
		.where('[targetType+targetId]')
		.equals([targetType, targetId])
		.filter((assignment) => assignment.tagId === tagId && !assignment.deletedAt)
		.first();
	if (existing) return existing;

	const timestamp = now();
	const assignment = {
		id: createId(),
		tagId,
		targetType,
		targetId,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await tagAssignments.add(assignment);
	return assignment;
}

export async function unassignTag(tagId, targetType, targetId) {
	const timestamp = now();
	await tagAssignments
		.where('[targetType+targetId]')
		.equals([targetType, targetId])
		.filter((assignment) => assignment.tagId === tagId && !assignment.deletedAt)
		.modify({ deletedAt: timestamp, updatedAt: timestamp });
}

export async function listTagsFor(targetType, targetId) {
	const assignments = await tagAssignments
		.where('[targetType+targetId]')
		.equals([targetType, targetId])
		.filter((assignment) => !assignment.deletedAt)
		.toArray();
	const tagIds = assignments.map((assignment) => assignment.tagId);
	const rows = await tags.bulkGet(tagIds);
	return rows.filter((tag) => tag && !tag.deletedAt);
}

// One round trip for "which tags does each of these blocks/snippets have":
// the editor and the sidebar render many targets at once.
export async function listTagsForMany(targetType, targetIds) {
	const wanted = new Set(targetIds);
	const assignments = await tagAssignments
		.filter(
			(assignment) =>
				assignment.targetType === targetType &&
				!assignment.deletedAt &&
				wanted.has(assignment.targetId)
		)
		.toArray();
	const tagIds = [...new Set(assignments.map((assignment) => assignment.tagId))];
	const rows = await tags.bulkGet(tagIds);
	const liveTags = new Map(
		rows.filter((tag) => tag && !tag.deletedAt).map((tag) => [tag.id, tag])
	);
	const map = Object.fromEntries(targetIds.map((id) => [id, []]));
	for (const assignment of assignments) {
		const tag = liveTags.get(assignment.tagId);
		if (tag) map[assignment.targetId].push(tag);
	}
	return map;
}

// Every live tag assignment, for building the search tagsByTarget map.
export async function listAllAssignments() {
	return tagAssignments.filter((assignment) => !assignment.deletedAt).toArray();
}

export async function listAssignmentsForTag(tagId) {
	return tagAssignments
		.where('tagId')
		.equals(tagId)
		.filter((assignment) => !assignment.deletedAt)
		.toArray();
}
