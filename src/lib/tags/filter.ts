// Tag picker filtering (specs/006): alphabetical, prefix matches first,
// case-insensitive, tolerant of a typed leading "#".

import { normalizeTagName } from './names';

export function filterTags(tags, query) {
	const needle = normalizeTagName(query).toLowerCase();
	const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
	if (!needle) return sorted;
	const starts = sorted.filter((tag) => tag.name.toLowerCase().startsWith(needle));
	const contains = sorted.filter(
		(tag) => !starts.includes(tag) && tag.name.toLowerCase().includes(needle)
	);
	return [...starts, ...contains];
}
