// Turns the flat list of live tag assignments into the lookup searchAll
// wants: "type:id" -> [tagId]. Kept pure so it is trivially testable.

export function buildTagsByTarget(assignments) {
	const map = {};
	for (const assignment of assignments) {
		const key = `${assignment.targetType}:${assignment.targetId}`;
		(map[key] ??= []).push(assignment.tagId);
	}
	return map;
}
