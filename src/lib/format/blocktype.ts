export const HEADING_TYPES = ['heading1', 'heading2', 'heading3'];

// Compute the field changes to convert `block` to `nextType` in place. Headings
// carry no check state. This never creates or removes a block.
export function planBlockType(block, nextType) {
	const changes = { type: nextType };
	if (HEADING_TYPES.includes(nextType)) changes.checked = false;
	else changes.checked = block.checked ?? false;
	return changes;
}
