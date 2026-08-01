import { db } from './db';
import { now } from './ids';
import { journalSetting, journaledSetting, unjournalSetting } from './journal';
import { trackPendingWrite } from './pending-writes';
import { KEY } from './settings-registry';
import { bumpAgentDataUrgent } from '$lib/bridge/signal.svelte';

const settings = db.table('settings');

// Generic key-value access. Deliberately NOT re-exported from the storage
// barrel (storage/index.ts) so app code goes through a typed wrapper below and
// each preference name stays declared in settings-registry. Tests import these
// directly as low-level probes.
export async function getSetting(key) {
	// A change journaled but not yet written is newer than the table. Boot replay
	// settles it, but the theme is read before that runs (+layout.svelte).
	const pending = journaledSetting(key);
	if (pending) return pending.value;
	const row = await settings.get(key);
	return row ? row.value : undefined;
}

export function setSetting(key, value) {
	// Journal first: an IndexedDB write started while the page dies is discarded,
	// and localStorage is synchronous, so it survives. Retired once the write lands.
	journalSetting(key, value);
	return trackPendingWrite(async () => {
		await settings.put({ key, value, updatedAt: now() });
		unjournalSetting(key, value);
	});
}

export function getTheme() {
	return getSetting(KEY.theme);
}

export function setTheme(value) {
	return setSetting(KEY.theme, value);
}

export async function getHasCompletedOnboarding() {
	return (await getSetting(KEY.hasCompletedOnboarding)) === true;
}

export function setHasCompletedOnboarding(value) {
	return setSetting(KEY.hasCompletedOnboarding, value === true);
}

export function getLastOpenedNoteId() {
	return getSetting(KEY.lastOpenedNoteId);
}

export function setLastOpenedNoteId(noteId) {
	return setSetting(KEY.lastOpenedNoteId, noteId);
}

// Marks that the first-run demo note was seeded, so it is never recreated —
// not even if the user later deletes it and empties the note list.
export async function getDemoNoteCreated() {
	return (await getSetting(KEY.demoNoteCreated)) === true;
}

export function setDemoNoteCreated(value) {
	return setSetting(KEY.demoNoteCreated, value === true);
}

// Agenda: whether completed todos are hidden from the list (spec 021).
export async function getAgendaHideCompleted() {
	return (await getSetting(KEY.agendaHideCompleted)) === true;
}

export function setAgendaHideCompleted(value) {
	return setSetting(KEY.agendaHideCompleted, value === true);
}

// Note-text size multiplier applied via --cn-editor-scale (spec 027).
export function getEditorTextScale() {
	return getSetting(KEY.editorTextScale);
}

export function setEditorTextScale(value) {
	return setSetting(KEY.editorTextScale, value);
}

// The master agent switch. Paused = the ingest gate rejects every request AND
// the export the agent reads goes out empty, whatever each note's agentVisible
// says — one place to cut, without having to walk note by note. Default false
// (missing key = not paused), so nothing changes for anyone who never uses it.
export async function getAgentsPaused() {
	return (await getSetting(KEY.agentsPaused)) === true;
}

export function setAgentsPaused(value) {
	// The re-export bump lives HERE, not at the call site, and fires whether the
	// write resolved or rejected — same safety-net shape notes.ts uses. Two
	// reasons: a caller cannot forget it, and `setSetting` journals to
	// localStorage BEFORE touching the database, so in the app a failed write
	// still leaves the pause in force. With the bump on the happy path only, that
	// failure left
	// the screen saying "pausados" while export.json still held every visible
	// note — exactly the half this switch promises to cut. Urgent both ways:
	// pausing must empty the file at once, same rule as hiding a note.
	return setSetting(KEY.agentsPaused, value === true).finally(() => bumpAgentDataUrgent());
}
