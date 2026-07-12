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
