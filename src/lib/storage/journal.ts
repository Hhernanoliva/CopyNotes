// Last-chance persistence for debounced saves. IndexedDB writes started while
// the page is unloading are silently discarded by the browser (verified: a
// transaction created inside pagehide never commits), so the editor journals
// its pending changes to localStorage — which is synchronous and does survive
// unload — and the next boot replays them into the database before anything
// reads. Without this, closing or reloading within the save debounce window
// loses the last keystrokes.

import { db } from './db';
import { now } from './ids';
import { updateNote } from './notes';
import { updateBlock } from './blocks';

export const JOURNAL_KEY = 'copynotes:pending-writes';
export const SETTINGS_JOURNAL_KEY = 'copynotes:pending-settings';

export function writeJournal(entries) {
	try {
		if (!entries.length) return;
		localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
	} catch {
		// localStorage unavailable (SSR, privacy mode) — the in-app flush on
		// unmount and note switches still covers normal navigation.
	}
}

export function clearJournal() {
	try {
		localStorage.removeItem(JOURNAL_KEY);
	} catch {
		// Nothing to clean up if storage is unavailable.
	}
}

// Preferences are written straight through with no debounce, so they need the
// same last-chance path — a write started as the page dies is discarded just
// the same. This is a journal, not a mirror: the entry is written before the
// database write and dropped as soon as it lands, so the settings table stays
// the only source of truth and a restored backup has nothing to reconcile.

function readSettingsJournal() {
	try {
		const raw = localStorage.getItem(SETTINGS_JOURNAL_KEY);
		const entries = raw ? JSON.parse(raw) : null;
		return entries && typeof entries === 'object' && !Array.isArray(entries) ? entries : null;
	} catch {
		return null;
	}
}

function saveSettingsJournal(entries) {
	try {
		if (Object.keys(entries).length) {
			localStorage.setItem(SETTINGS_JOURNAL_KEY, JSON.stringify(entries));
		} else {
			localStorage.removeItem(SETTINGS_JOURNAL_KEY);
		}
	} catch {
		// localStorage unavailable (SSR, privacy mode) — the write itself still
		// runs, it just loses its safety net.
	}
}

export function journalSetting(key, value) {
	saveSettingsJournal({ ...(readSettingsJournal() ?? {}), [key]: value });
}

export function unjournalSetting(key, value) {
	const entries = readSettingsJournal();
	if (!entries || !(key in entries)) return;
	// A newer change to the same preference may already be queued; only the
	// write that owns the journaled value may retire it.
	if (JSON.stringify(entries[key]) !== JSON.stringify(value)) return;
	delete entries[key];
	saveSettingsJournal(entries);
}

export function journaledSetting(key) {
	const entries = readSettingsJournal();
	return entries && key in entries ? { value: entries[key] } : null;
}

async function replaySettingsJournal() {
	const entries = readSettingsJournal();
	if (entries) {
		const updatedAt = now();
		for (const [key, value] of Object.entries(entries)) {
			await db.table('settings').put({ key, value, updatedAt });
		}
	}
	// Also drops a journal too corrupt to read, so it cannot linger forever.
	saveSettingsJournal({});
}

export async function replayJournal() {
	await replaySettingsJournal();

	let entries = null;
	try {
		const raw = localStorage.getItem(JOURNAL_KEY);
		entries = raw ? JSON.parse(raw) : null;
	} catch {
		clearJournal();
		return;
	}
	if (!Array.isArray(entries)) {
		clearJournal();
		return;
	}
	for (const entry of entries) {
		if (!entry || typeof entry.id !== 'string' || typeof entry.changes !== 'object') continue;
		if (entry.table === 'notes') await updateNote(entry.id, entry.changes);
		else if (entry.table === 'blocks') await updateBlock(entry.id, entry.changes);
	}
	clearJournal();
}
