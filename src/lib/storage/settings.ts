import { db } from './db';
import { now } from './ids';

const settings = db.table('settings');

export async function getSetting(key) {
	const row = await settings.get(key);
	return row ? row.value : undefined;
}

export async function setSetting(key, value) {
	await settings.put({ key, value, updatedAt: now() });
}

export function getTheme() {
	return getSetting('theme');
}

export function setTheme(value) {
	return setSetting('theme', value);
}

export async function getHasCompletedOnboarding() {
	return (await getSetting('hasCompletedOnboarding')) === true;
}

export function setHasCompletedOnboarding(value) {
	return setSetting('hasCompletedOnboarding', value === true);
}

export function getLastOpenedNoteId() {
	return getSetting('lastOpenedNoteId');
}

export function setLastOpenedNoteId(noteId) {
	return setSetting('lastOpenedNoteId', noteId);
}
