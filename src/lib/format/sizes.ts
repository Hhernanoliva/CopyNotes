// Inline text size (spec 032). Same three steps as the block headings, applied
// to a fragment of a row instead of the whole row. Twin of colors.ts: this is
// the single list of approved size classes, read by sanitize.ts and by the
// toolbar's command routing.
//
// This is size, not a heading: it carries no semantics, no weight change, and
// unwraps to bare text on Markdown export.
export const TEXT_SIZES = [
	{ id: 'h1', label: 'Título 1', className: 'fmt-size-h1' },
	{ id: 'h2', label: 'Título 2', className: 'fmt-size-h2' },
	{ id: 'h3', label: 'Título 3', className: 'fmt-size-h3' }
];

// The class for a toolbar command name, or null when the command carries no
// size — `normal` (¶) clears the mark instead of applying one.
export function sizeClassFor(name) {
	return TEXT_SIZES.find((size) => size.id === name)?.className ?? null;
}
