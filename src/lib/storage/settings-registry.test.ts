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
				'agendaHideCompleted',
				'editorTextScale',
				'connectedAgent',
				'agentsPaused',
				'processedChanges',
				'syncConsent',
				'syncUploadedThrough',
				'syncDownloadedThrough',
				'syncAccountId'
			].sort()
		);
	});

	it('exposes every current preference as backup-safe', () => {
		expect(SAFE_SETTING_KEYS.sort()).toEqual(
			[
				'theme',
				'hasCompletedOnboarding',
				'lastOpenedNoteId',
				'demoNoteCreated',
				'agendaHideCompleted',
				'editorTextScale'
			].sort()
		);
	});

	it('treats connectedAgent as not backup-safe', () => {
		expect(isBackupSafe('connectedAgent')).toBe(false);
	});

	// Import only writes backup-safe keys, and "Reemplazar todo" preserves the
	// keys that are NOT safe (storage/backup.ts) precisely because they describe
	// this device: that pair is what stops a restored file from un-pausing a
	// device the user paused.
	it('treats agentsPaused as not backup-safe', () => {
		expect(isBackupSafe('agentsPaused')).toBe(false);
	});

	// Which account left the vault key and the cursors here (sync/leave.ts). A
	// file that vouched for an account this device never signed into would hand
	// it the previous account's key.
	it('treats syncAccountId as not backup-safe', () => {
		expect(isBackupSafe('syncAccountId')).toBe(false);
	});

	it('treats processedChanges as not backup-safe', () => {
		expect(isBackupSafe('processedChanges')).toBe(false);
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
