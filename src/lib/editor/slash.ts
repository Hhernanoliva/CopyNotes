// Slash command catalog and keyboard-selection logic, kept out of the
// component so it can be tested without rendering. /snippet arrives with
// the snippets stage (specs/005).

export const SLASH_COMMANDS = [
	{ id: 'text', label: 'Texto', keywords: ['text', 'texto', 'parrafo', 'párrafo'] },
	{ id: 'heading1', label: 'Título 1', keywords: ['h1', 'titulo', 'título', 'heading', 'encabezado'] },
	{ id: 'heading2', label: 'Título 2', keywords: ['h2', 'titulo', 'título', 'heading', 'subtitulo'] },
	{ id: 'heading3', label: 'Título 3', keywords: ['h3', 'titulo', 'título', 'heading'] },
	{ id: 'bullet', label: 'Viñeta', keywords: ['bullet', 'viñeta', 'vineta', 'lista'] },
	{ id: 'todo', label: 'Tarea', keywords: ['todo', 'tarea', 'check', 'checkbox'] },
	{ id: 'date', label: 'Fecha', keywords: ['fecha', 'date', 'agenda', 'hoy', 'vencimiento', 'recordatorio'] },
	{ id: 'code', label: 'Código', keywords: ['code', 'codigo', 'código'] },
	{ id: 'separator', label: 'Separador', keywords: ['separator', 'separador', 'divider', 'linea', 'línea'] },
	{ id: 'snippet', label: 'Snippet', keywords: ['snippet', 'plantilla', 'reutilizar'] }
];

export function filterCommands(query) {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...SLASH_COMMANDS];
	const terms = (command) => [command.id, command.label.toLowerCase(), ...command.keywords];
	const starts = SLASH_COMMANDS.filter((command) =>
		terms(command).some((term) => term.startsWith(needle))
	);
	const contains = SLASH_COMMANDS.filter(
		(command) =>
			!starts.includes(command) && terms(command).some((term) => term.includes(needle))
	);
	return [...starts, ...contains];
}

export function moveSelection(index, delta, length) {
	if (length <= 0) return 0;
	return (index + delta + length) % length;
}

// Decide the slash-menu state after one input event, anywhere in the block —
// not only when "/" is the first character. `prev` is { anchor, query } while
// the menu is open (anchor = plain-text offset of the "/"), or null.
// `caret` is the plain-text caret offset after the edit; null when the caller
// could not read the selection, which falls back to the original
// start-of-block rule so the menu still works without caret info.
export function nextSlashState(prev, { prevText, text, caret }) {
	if (prev) {
		const anchor = prev.anchor;
		if (anchor >= text.length || text[anchor] !== '/') return null;
		const query = caret == null ? text.slice(anchor + 1) : text.slice(anchor + 1, caret);
		if (caret != null && caret <= anchor) return null;
		if (query.includes('\n')) return null;
		return { anchor, query };
	}
	if (caret == null) {
		if (!text.startsWith('/') || text.includes('\n')) return null;
		return { anchor: 0, query: text.slice(1) };
	}
	// Open only when exactly one character was inserted and it is a "/": a
	// paste or a deletion that leaves the caret next to an old slash is not a
	// request to open the menu.
	if (text.length !== (prevText ?? '').length + 1) return null;
	if (caret < 1 || text[caret - 1] !== '/') return null;
	return { anchor: caret - 1, query: '' };
}
