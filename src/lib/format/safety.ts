// Which toolbar commands are safe for the current selection. Code/separator
// blocks accept no formatting. Inline formatting only applies within a single
// block (spec 020), so a selection spanning multiple blocks disables every
// unsafe command rather than half-applying them.
export function commandsForSelection({ blockType, spansBlocks }) {
	if (blockType === 'code' || blockType === 'separator') {
		return { inline: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	if (spansBlocks) {
		return { inline: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	return {
		inline: true,
		inlineCode: true,
		blockType: true,
		link: true,
		color: true
	};
}

// Does the selection cover the whole row? Decides which of the two gestures the
// H1/H2/H3 buttons perform (spec 032): the whole row becomes a heading block,
// a fragment gets the inline size mark instead.
//
// Both sides are trimmed, so a trailing space or the newline a browser drags
// into the selection does not flip the gesture. Empty text returns false on
// purpose: an empty row stores the phantom "\n"
// (see AGENT.md), and `"" === ""` would otherwise convert it out of nowhere.
export function selectionCoversBlock(selectedText, blockText) {
	const selected = (selectedText ?? '').trim();
	if (!selected) return false;
	return selected === (blockText ?? '').trim();
}
