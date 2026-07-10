// Snippet picker filtering (specs/005): favorites always surface first so
// the most-used snippets are one keystroke away, both in the /snippet menu
// and the sidebar library.

export function filterSnippets(snippets, query) {
	const needle = (query ?? '').trim().toLowerCase();
	const matches = needle
		? snippets.filter(
				(snippet) =>
					snippet.name.toLowerCase().includes(needle) ||
					snippet.content.toLowerCase().includes(needle)
			)
		: [...snippets];
	const favorites = matches.filter((snippet) => snippet.isFavorite);
	const rest = matches.filter((snippet) => !snippet.isFavorite);
	return [...favorites, ...rest];
}
