// Last-chance persistence for debounced saves. IndexedDB writes started while
// the page is unloading are silently discarded by the browser (verified: a
// transaction created inside pagehide never commits), so the editor journals
// its pending changes to localStorage — which is synchronous and does survive
// unload — and the next boot replays them into the database before anything
// reads. Without this, closing or reloading within the save debounce window
// loses the last keystrokes.

import { updateNote } from './notes';
import { updateBlock } from './blocks';

export const JOURNAL_KEY = 'copynotes:pending-writes';

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

export async function replayJournal() {
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
