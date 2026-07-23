import { db } from './db';
import { now } from './ids';
import { trackPendingWrite } from './pending-writes';
import { KEY } from './settings-registry';

const settings = db.table('settings');

// Generic key-value access. Deliberately NOT re-exported from the storage
// barrel (storage/index.ts) so app code goes through a typed wrapper below and
// each preference name stays declared in settings-registry. Tests import these
// directly as low-level probes.
export async function getSetting(key) {
	const row = await settings.get(key);
	return row ? row.value : undefined;
}

export function setSetting(key, value) {
	return trackPendingWrite(() => settings.put({ key, value, updatedAt: now() }));
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
