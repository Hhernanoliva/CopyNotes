// Builds the backup object defined in specs/018. Pure: table data comes in,
// the storage layer decides what to read (full dump including soft-deleted).

import { CURRENT_VERSION, SUPPORTED_FORMAT } from './schema';
import { isBackupSafe } from '../storage/settings-registry';

const TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'folders', 'settings'];

export function buildBackup(tables, meta) {
	const { appVersion, exportedAt, source = 'pwa' } = meta;
	const data = Object.fromEntries(TABLES.map((table) => [table, tables[table] ?? []]));
	// A preference the whitelist doesn't bless never reaches the file — the
	// backup is the boundary where data leaves the device.
	data.settings = data.settings.filter((row) => isBackupSafe(row.key));
	const counts = Object.fromEntries(TABLES.map((table) => [table, data[table].length]));
	return {
		format: SUPPORTED_FORMAT,
		formatVersion: CURRENT_VERSION,
		app: { name: 'CopyNotes', version: appVersion },
		exportedAt,
		exportedBy: { source },
		counts,
		data
	};
}

export function backupFileName(date) {
	const pad = (value) => String(value).padStart(2, '0');
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
	return `copynotes-backup-${stamp}.json`;
}
