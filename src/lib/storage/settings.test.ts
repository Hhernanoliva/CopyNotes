import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { agentData } from '$lib/bridge/signal.svelte';
import {
	getDemoNoteCreated,
	getHasCompletedOnboarding,
	getLastOpenedNoteId,
	getSetting,
	getTheme,
	setDemoNoteCreated,
	setHasCompletedOnboarding,
	setLastOpenedNoteId,
	setSetting,
	setTheme,
	getAgendaHideCompleted,
	setAgendaHideCompleted,
	getAgentsPaused,
	setAgentsPaused
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

	it('theme helpers remember the selected theme', async () => {
		await setTheme('dark');
		expect(await getTheme()).toBe('dark');
		await setTheme('light');
		expect(await getTheme()).toBe('light');
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

	it('demo-note flag defaults to false and can be marked created', async () => {
		expect(await getDemoNoteCreated()).toBe(false);
		await setDemoNoteCreated(true);
		expect(await getDemoNoteCreated()).toBe(true);
	});

	it('agendaHideCompleted round-trips and defaults to false (spec 021)', async () => {
		expect(await getAgendaHideCompleted()).toBe(false);
		await setAgendaHideCompleted(true);
		expect(await getAgendaHideCompleted()).toBe(true);
	});

	it('agentsPaused round-trips and defaults to false', async () => {
		expect(await getAgentsPaused()).toBe(false);
		await setAgentsPaused(true);
		expect(await getAgentsPaused()).toBe(true);
	});

	// The read half of the pause rides on this bump: without it export.json keeps
	// every visible note while the screen says "pausados".
	it('setAgentsPaused asks for an urgent re-export', async () => {
		const before = agentData.urgent;
		await setAgentsPaused(true);
		expect(agentData.urgent).toBeGreaterThan(before);
	});

	// A failed write must STILL rebuild the file the agents read: in the app the
	// pause is journaled to localStorage before the database is touched, so it is
	// already in force. Bumping only on success left the screen saying "pausados"
	// with export.json holding every visible note. (The journal half is not
	// asserted here — this suite runs without localStorage.)
	it('setAgentsPaused still asks for the re-export when the write fails', async () => {
		const before = agentData.urgent;
		const put = vi.spyOn(db.table('settings'), 'put').mockRejectedValue(new Error('disco lleno'));
		try {
			await expect(setAgentsPaused(true)).rejects.toThrow('disco lleno');
		} finally {
			put.mockRestore();
		}
		expect(agentData.urgent).toBeGreaterThan(before);
	});
});
