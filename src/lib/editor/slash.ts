// Slash command catalog and keyboard-selection logic, kept out of the
// component so it can be tested without rendering. /snippet arrives with
// the snippets stage (specs/005).

export const SLASH_COMMANDS = [
	{ id: 'text', label: 'Texto', keywords: ['text', 'texto', 'parrafo', 'párrafo'] },
	{ id: 'bullet', label: 'Viñeta', keywords: ['bullet', 'viñeta', 'vineta', 'lista'] },
	{ id: 'todo', label: 'Tarea', keywords: ['todo', 'tarea', 'check', 'checkbox'] },
	{ id: 'code', label: 'Código', keywords: ['code', 'codigo', 'código', 'snippet'] },
	{ id: 'separator', label: 'Separador', keywords: ['separator', 'separador', 'divider', 'linea', 'línea'] }
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
