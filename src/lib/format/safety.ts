import { HEADING_TYPES } from './blocktype';

// Which toolbar commands are safe for the current selection. Code/separator
// blocks accept no formatting. Inline formatting only applies within a single
// block (spec 020), so a selection spanning multiple blocks disables every
// unsafe command rather than half-applying them.
//
// `bold` va aparte de `inline` por un solo caso: en un título el navegador se
// niega a poner negrita —el renglón ya se dibuja grueso (700 en H1/H2, 600 en
// H3), y ahí `execCommand('bold')` entiende "sacala" y no hace nada—, así que
// el botón tiene que verse apagado en vez de prometer algo que no ocurre. Las
// otras marcas en línea (cursiva, subrayado, tachado) sí funcionan en un
// título.
export function commandsForSelection({ blockType, spansBlocks }) {
	if (blockType === 'code' || blockType === 'separator') {
		return { inline: false, bold: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	if (spansBlocks) {
		return { inline: false, bold: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	return {
		inline: true,
		bold: !HEADING_TYPES.includes(blockType),
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
