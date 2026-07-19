import { describe, expect, it } from 'vitest';
import { buildBackup, backupFileName } from './backup';
import { validateBackup } from './schema';

const iso = '2026-07-10T12:00:00.000Z';

describe('buildBackup', () => {
	it('builds a valid backup with counts matching the data', () => {
		const backup = buildBackup(
			{
				notes: [{ id: 'note_1', title: 'Demo', createdAt: iso, updatedAt: iso, deletedAt: null }],
				blocks: [],
				snippets: [],
				tags: [],
				tagAssignments: [],
				settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
			},
			{ appVersion: '0.0.1', exportedAt: iso }
		);
		expect(backup.format).toBe('copynotes.backup');
		expect(backup.formatVersion).toBe(4);
		expect(backup.app).toEqual({ name: 'CopyNotes', version: '0.0.1' });
		expect(backup.exportedAt).toBe(iso);
		expect(backup.counts.notes).toBe(1);
		expect(backup.counts.settings).toBe(1);
		expect(validateBackup(backup).ok).toBe(true);
	});

	it('fills missing tables with empty arrays', () => {
		const backup = buildBackup({}, { appVersion: '0.0.1', exportedAt: iso });
		expect(backup.data.blocks).toEqual([]);
		expect(backup.counts.blocks).toBe(0);
		expect(validateBackup(backup).ok).toBe(true);
	});

	it('includes an empty folders table and its count (spec 022)', () => {
		const backup = buildBackup({}, { appVersion: '0.0.1', exportedAt: iso });
		expect(backup.data.folders).toEqual([]);
		expect(backup.counts.folders).toBe(0);
	});

	it('records whether a backup came from the PWA or desktop app', () => {
		const pwa = buildBackup({}, { appVersion: '0.0.1', exportedAt: iso });
		const desktop = buildBackup(
			{},
			{ appVersion: '0.0.1', exportedAt: iso, source: 'desktop' }
		);
		expect(pwa.exportedBy.source).toBe('pwa');
		expect(desktop.exportedBy.source).toBe('desktop');
	});
});

describe('backupFileName', () => {
	it('formats the date as copynotes-backup-YYYY-MM-DD-HHMM.json in local time', () => {
		const date = new Date(2026, 6, 9, 16, 30);
		expect(backupFileName(date)).toBe('copynotes-backup-2026-07-09-1630.json');
	});

	it('pads single-digit fields with zeros', () => {
		const date = new Date(2026, 0, 5, 9, 7);
		expect(backupFileName(date)).toBe('copynotes-backup-2026-01-05-0907.json');
	});
});
