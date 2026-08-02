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
	//
	// The mapping stores SLICE offsets, not character counts: an emoji is one
	// character to iterate but two units to `slice`, so counting characters and
	// cutting with those numbers shifted every highlight after an emoji — and cut
	// the emoji itself in half.
	let folded = '';
	const sliceStart = [];
	const sliceEnd = [];
	let offset = 0;
	for (const char of text) {
		const piece = fold(char);
		folded += piece;
		for (let i = 0; i < piece.length; i++) {
			sliceStart.push(offset);
			sliceEnd.push(offset + char.length);
		}
		offset += char.length;
	}

	const segments = [];
	let cursor = 0;
	let from = 0;
	while (from <= folded.length) {
		const hit = folded.indexOf(needle, from);
		if (hit === -1) break;
		const matchStart = sliceStart[hit];
		const matchEnd = sliceEnd[hit + needle.length - 1];
		if (matchStart > cursor) segments.push({ text: text.slice(cursor, matchStart), match: false });
		segments.push({ text: text.slice(matchStart, matchEnd), match: true });
		cursor = matchEnd;
		from = hit + needle.length;
	}
	if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
	return segments.length ? segments : [{ text, match: false }];
}
