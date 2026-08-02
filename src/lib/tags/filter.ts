// Tag picker filtering (specs/006): alphabetical, prefix matches first,
// case-insensitive, tolerant of a typed leading "#".

import { foldTagName } from './names';

export function filterTags(tags, query) {
	// Same folding as tagNamesMatch: the picker offers "create" only when that
	// check says the name is new, so filtering by a stricter rule would hide the
	// tag AND the way to make it.
	const needle = foldTagName(query);
	const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
	if (!needle) return sorted;
	const starts = sorted.filter((tag) => foldTagName(tag.name).startsWith(needle));
	const contains = sorted.filter(
		(tag) => !starts.includes(tag) && foldTagName(tag.name).includes(needle)
	);
	return [...starts, ...contains];
}
