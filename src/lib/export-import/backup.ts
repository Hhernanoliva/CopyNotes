// Builds the backup object defined in specs/018. Pure: table data comes in,
// the storage layer decides what to read (full dump including soft-deleted).

import { CURRENT_VERSION, SUPPORTED_FORMAT } from './schema';

const TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'folders', 'settings'];

export function buildBackup(tables, meta) {
	const { appVersion, exportedAt, source = 'pwa' } = meta;
	const data = Object.fromEntries(TABLES.map((table) => [table, tables[table] ?? []]));
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
