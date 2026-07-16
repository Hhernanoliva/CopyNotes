export const HEADING_LEVELS = { heading1: 1, heading2: 2, heading3: 3 };
export const HEADING_TYPES = Object.keys(HEADING_LEVELS);

// Compute the field changes to convert `block` to `nextType` in place. Headings
// carry no check state. This never creates or removes a block.
export function planBlockType(block, nextType) {
	const changes = { type: nextType, checked: false };
	if (!HEADING_TYPES.includes(nextType)) changes.checked = block.checked ?? false;
	return changes;
}
