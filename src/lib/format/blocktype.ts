export const HEADING_LEVELS = { heading1: 1, heading2: 2, heading3: 3 };
export const HEADING_TYPES = Object.keys(HEADING_LEVELS);

// The one list of block types. Backup validation (export-import/schema.ts) and
// the ingest gate (format/ingest.ts) both read it — a future block type added
// here is automatically accepted by both.
export const BLOCK_TYPES = ['text', 'bullet', 'todo', 'code', 'separator', ...HEADING_TYPES];

// Compute the field changes to convert `block` to `nextType` in place. Headings
// carry no check state. This never creates or removes a block.
export function planBlockType(block, nextType) {
	const changes = { type: nextType, checked: false };
	if (!HEADING_TYPES.includes(nextType)) changes.checked = block.checked ?? false;
	return changes;
}
