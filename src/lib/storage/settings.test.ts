import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	getHasCompletedOnboarding,
	getLastOpenedNoteId,
	getSetting,
	getTheme,
	setHasCompletedOnboarding,
	setLastOpenedNoteId,
	setSetting,
	setTheme
} from './settings';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('settings repository', () => {
	it('returns undefined for unknown keys', async () => {
		expect(await getSetting('missing')).toBeUndefined();
	});

	it('stores and overwrites a value by key', async () => {
		await setSetting('theme', 'dark');
		await setSetting('theme', 'light');
		expect(await getSetting('theme')).toBe('light');
	});

	it('theme helpers round trip', async () => {
		await setTheme('dark');
		expect(await getTheme()).toBe('dark');
	});

	it('onboarding defaults to false and can be completed', async () => {
		expect(await getHasCompletedOnboarding()).toBe(false);
		await setHasCompletedOnboarding(true);
		expect(await getHasCompletedOnboarding()).toBe(true);
	});

	it('last opened note round trips', async () => {
		await setLastOpenedNoteId('note-123');
		expect(await getLastOpenedNoteId()).toBe('note-123');
	});
});
