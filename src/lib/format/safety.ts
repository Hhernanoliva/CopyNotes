// Which toolbar commands are safe for the current selection. Code/separator
// blocks accept no formatting; a selection spanning multiple blocks disables
// block-type changes and inline code (they can produce inconsistent structure),
// while character-level marks stay available.
export function commandsForSelection({ blockType, spansBlocks }) {
	if (blockType === 'code' || blockType === 'separator') {
		return { inline: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	return {
		inline: true,
		inlineCode: !spansBlocks,
		blockType: !spansBlocks,
		link: true,
		color: true
	};
}
