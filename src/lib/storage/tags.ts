import { db } from './db';
import { createId, now } from './ids';

const tags = db.table('tags');
const tagAssignments = db.table('tagAssignments');

export async function createTag(fields) {
	const { name, color = null } = fields;
	const timestamp = now();
	const tag = {
		id: createId(),
		name,
		color,
		createdAt: timestamp,
		updatedAt: timestamp,
		deletedAt: null
	};
	await tags.add(tag);
	return tag;
}

export async function getTag(id) {
	const tag = await tags.get(id);
	if (!tag || tag.deletedAt) return undefined;
	return tag;
}

export async function listTags() {
	const rows = await tags.filter((tag) => !tag.deletedAt).toArray();
	return rows.sort((a, b) => a.name.localeCompare(b.name));
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

export async function listAssignmentsForTag(tagId) {
	return tagAssignments
		.where('tagId')
		.equals(tagId)
		.filter((assignment) => !assignment.deletedAt)
		.toArray();
}
