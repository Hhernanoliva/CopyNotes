import { describe, expect, it } from 'vitest';
import { SETTINGS, SAFE_SETTING_KEYS, isBackupSafe } from './settings-registry';

describe('settings registry', () => {
	it('lists every current preference', () => {
		expect(Object.keys(SETTINGS).sort()).toEqual(
			[
				'theme',
				'hasCompletedOnboarding',
				'lastOpenedNoteId',
				'demoNoteCreated',
				'agendaHideCompleted'
			].sort()
		);
	});

	it('exposes the five current preferences as backup-safe', () => {
		expect(SAFE_SETTING_KEYS.sort()).toEqual(
			[
				'theme',
				'hasCompletedOnboarding',
				'lastOpenedNoteId',
				'demoNoteCreated',
				'agendaHideCompleted'
			].sort()
		);
	});

	it('treats an unknown key as not backup-safe', () => {
		expect(isBackupSafe('apiToken')).toBe(false);
	});

	it('only includes keys flagged backupSafe', () => {
		for (const key of SAFE_SETTING_KEYS) {
			expect(SETTINGS[key].backupSafe).toBe(true);
		}
	});
});
