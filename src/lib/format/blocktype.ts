export const HEADING_LEVELS = { heading1: 1, heading2: 2, heading3: 3 };
export const HEADING_TYPES = Object.keys(HEADING_LEVELS);

// The one list of block types. Backup validation (export-import/schema.ts) and
// the ingest gate (format/ingest.ts) both read it — a future block type added
// here is automatically accepted by both.
export const BLOCK_TYPES = ['text', 'bullet', 'todo', 'code', 'separator', 'image', ...HEADING_TYPES];

// Una imagen no se convierte en título ni en tarea, y nada se convierte en
// imagen: el tipo `image` sólo lo crea `insertImageBlock`, que además guarda los
// bytes (spec 041). Cambiarle el tipo a un bloque de imagen dejaría un `imageId`
// colgado, y al revés dejaría un bloque de imagen sin imagen.
export function canChangeType(block, nextType) {
	return block.type !== 'image' && nextType !== 'image';
}

// Compute the field changes to convert `block` to `nextType` in place. Headings
// carry no check state. This never creates or removes a block. `null` significa
// "no se puede": el que llama no escribe nada.
export function planBlockType(block, nextType) {
	if (!canChangeType(block, nextType)) return null;
	const changes = { type: nextType, checked: false };
	if (!HEADING_TYPES.includes(nextType)) changes.checked = block.checked ?? false;
	return changes;
}
