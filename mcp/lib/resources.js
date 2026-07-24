// Pure mappers: export payload (see lib/mailbox.js readExport()) → MCP
// resource shapes. No fs, no MCP SDK — server.js wires these into
// registerResource(). Kept pure so they're unit-testable without stdio.

// How many bitácora entries to keep per task when projecting a note's
// content for an agent. Full history lives in the app; agents only need
// recent context to act.
export const ACTIVITY_TAIL_LENGTH = 5;

/**
 * Maps an export payload to the list of MCP resources — one per
 * agent-visible note. Used by the ResourceTemplate's `list` callback.
 */
export function notesToResources(exportPayload) {
	const notes = exportPayload?.notes ?? [];
	return notes.map((note) => ({
		uri: `copynotes://note/${note.id}`,
		name: note.title ?? '',
		mimeType: 'application/json'
	}));
}

function projectActivity(activity) {
	const list = activity ?? [];
	return list.slice(-ACTIVITY_TAIL_LENGTH).map(({ actor, action, text, at }) => ({ actor, action, text, at }));
}

function projectTask(task) {
	const { id, content, checked, createdBy, activity } = task;
	return { id, content, checked, createdBy, activity: projectActivity(activity) };
}

/**
 * Maps a single note (as found in the export payload) to the JSON content
 * returned by a resource `read` — tasks projected to what an agent needs
 * (drops `html`; caps bitácora activity to a short tail).
 */
export function noteToResourceContent(note) {
	const tasks = note?.tasks ?? [];
	return {
		id: note.id,
		title: note.title,
		tasks: tasks.map(projectTask)
	};
}
