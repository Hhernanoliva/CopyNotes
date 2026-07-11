// Search core (specs/006). Pure and engine-agnostic on purpose: the UI only
// knows "text + tag ids in, grouped results out", so this simple substring
// matcher can later be swapped for fuzzy/full-text/AI search without touching
// anything outside src/lib/search/.
//
// dataset: { notes, blocks, snippets, tagsByTarget: { "type:id": [tagId] } }
// query:   { text, tagIds } — tag filter uses AND (item needs every tag).

function fold(text) {
	return (text ?? '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

export function searchAll(dataset, { text, tagIds }) {
	const needle = fold(text).trim();
	const hasText = needle.length > 0;
	if (!hasText && tagIds.length === 0) {
		return { notes: [], blocks: [], snippets: [] };
	}

	function passesTags(type, id) {
		const assigned = dataset.tagsByTarget[`${type}:${id}`] ?? [];
		return tagIds.every((tagId) => assigned.includes(tagId));
	}

	const notes = dataset.notes.filter(
		(note) => passesTags('note', note.id) && (!hasText || fold(note.title).includes(needle))
	);

	const blocks = dataset.blocks.filter(
		(block) => passesTags('block', block.id) && (!hasText || fold(block.content).includes(needle))
	);

	const snippets = dataset.snippets.filter(
		(snippet) =>
			passesTags('snippet', snippet.id) &&
			(!hasText || fold(snippet.name).includes(needle) || fold(snippet.content).includes(needle))
	);
	// Name hits read as stronger matches than content hits.
	if (hasText) {
		const byName = snippets.filter((snippet) => fold(snippet.name).includes(needle));
		const byContent = snippets.filter((snippet) => !byName.includes(snippet));
		return { notes, blocks, snippets: [...byName, ...byContent] };
	}

	return { notes, blocks, snippets };
}
