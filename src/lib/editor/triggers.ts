// Typed triggers in the editor (spec: editor UX pass, 2026-07-10). Pure so the
// component only maps the result to an action. Code blocks are exempt: their
// slashes/hashes/dashes are literal content.
//
// - "- " / "* " at the start of a text block  -> convert to bullet
// - a lone "#" as the whole block content     -> open the tag picker

const BULLET_PREFIXES = ['- ', '* '];

export function detectTrigger(block, text) {
	if (block.type === 'code') return null;
	if (block.type === 'text') {
		const prefix = BULLET_PREFIXES.find((candidate) => text.startsWith(candidate));
		if (prefix) return { kind: 'bullet', content: text.slice(prefix.length) };
	}
	if (text === '#') return { kind: 'tag' };
	return null;
}
