// Typed triggers in the editor (spec: editor UX pass, 2026-07-10). Pure so the
// component only maps the result to an action. Code blocks are exempt: their
// slashes/hashes/dashes are literal content.
//
// - "- " / "* " at the start of a text block  -> convert to bullet
// - a "#" standing on its own                 -> open the tag picker

const BULLET_PREFIXES = ['- ', '* '];

export function detectTrigger(block, text, { prevText = null, caret = null } = {}) {
	if (block.type === 'code') return null;
	if (block.type === 'text') {
		const prefix = BULLET_PREFIXES.find((candidate) => text.startsWith(candidate));
		if (prefix) return { kind: 'bullet', content: text.slice(prefix.length) };
	}
	const anchor = tagAnchor(text, prevText, caret);
	if (anchor != null) return { kind: 'tag', anchor };
	return null;
}

// The "#" is a command only when it stands alone: it is the character that just
// arrived, and there is nothing or whitespace before it. Glued to a word
// ("hola#") it is content.
function tagAnchor(text, prevText, caret) {
	// Without a caret we only know the whole block, so fall back to a lone "#".
	if (caret == null) return text === '#' ? 0 : null;
	const prev = prevText ?? '';
	if (caret < 1 || text[caret - 1] !== '#') return null;
	// "Just arrived" = everything before it is untouched (a paste rewrites more
	// than one character) and no "#" was already sitting there (deleting the
	// character after an old "#" is not a request to tag). Comparing prefixes
	// rather than lengths on purpose: emptying a line leaves a browser <br>
	// behind, so prevText can carry a phantom newline that skews any length.
	if (text.slice(0, caret - 1) !== prev.slice(0, caret - 1)) return null;
	if (prev[caret - 1] === '#') return null;
	const before = caret >= 2 ? text[caret - 2] : '';
	if (before !== '' && !/\s/.test(before)) return null;
	return caret - 1;
}
