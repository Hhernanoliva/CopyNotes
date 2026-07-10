// Builds the backup object defined in specs/018. Pure: table data comes in,
// the storage layer decides what to read (full dump including soft-deleted).

import { SUPPORTED_FORMAT } from './schema';

const TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'settings'];

export function buildBackup(tables, meta) {
	const { appVersion, exportedAt } = meta;
	const data = Object.fromEntries(TABLES.map((table) => [table, tables[table] ?? []]));
	const counts = Object.fromEntries(TABLES.map((table) => [table, data[table].length]));
	return {
		format: SUPPORTED_FORMAT,
		formatVersion: 1,
		app: { name: 'CopyNotes', version: appVersion },
		exportedAt,
		exportedBy: { source: 'pwa' },
		counts,
		data
	};
}

export function backupFileName(date) {
	const pad = (value) => String(value).padStart(2, '0');
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
	return `copynotes-backup-${stamp}.json`;
}
