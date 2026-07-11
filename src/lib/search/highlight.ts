// Splits text into matched / unmatched segments so the UI can bold the hit
// without dangerously injecting HTML. Accent- and case-insensitive, matching
// searchAll's folding, but the returned text preserves the original casing.

function fold(text) {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

export function highlightSegments(text, query) {
	const needle = fold(query ?? '').trim();
	if (!needle) return [{ text, match: false }];
	// Fold per character so folded indices line up with the original string
	// (NFD can otherwise change length, e.g. one char becoming two).
	const foldedChars = [...text].map((char) => fold(char));
	const folded = foldedChars.join('');
	// Map each folded-string index back to its original character index.
	const originIndex = [];
	foldedChars.forEach((piece, charIndex) => {
		for (let i = 0; i < piece.length; i++) originIndex.push(charIndex);
	});

	const segments = [];
	let cursor = 0;
	let from = 0;
	while (from <= folded.length) {
		const hit = folded.indexOf(needle, from);
		if (hit === -1) break;
		const startChar = originIndex[hit];
		const endChar = originIndex[hit + needle.length - 1] + 1;
		if (startChar > cursor) segments.push({ text: text.slice(cursor, startChar), match: false });
		segments.push({ text: text.slice(startChar, endChar), match: true });
		cursor = endChar;
		from = hit + needle.length;
	}
	if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
	return segments.length ? segments : [{ text, match: false }];
}
