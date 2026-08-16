// Builds the backup object defined in specs/018. Pure: table data comes in,
// the storage layer decides what to read (full dump including soft-deleted).

import { BACKUP_TABLES, CURRENT_VERSION, SUPPORTED_FORMAT } from './schema';
import { isBackupSafe } from '../storage/settings-registry';

export function buildBackup(tables, meta) {
	const { appVersion, exportedAt, source = 'pwa' } = meta;
	const data = Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table] ?? []]));
	// A preference the whitelist doesn't bless never reaches the file — the
	// backup is the boundary where data leaves the device.
	data.settings = data.settings.filter((row) => isBackupSafe(row.key));
	const counts = Object.fromEntries(BACKUP_TABLES.map((table) => [table, data[table].length]));
	return {
		format: SUPPORTED_FORMAT,
		formatVersion: CURRENT_VERSION,
		app: { name: 'CopyNotes', version: appVersion },
		exportedAt,
		exportedBy: { source },
		// ¿El aparato que bajó esto tenía TODO lo que hay que guardar? Hoy la respuesta
		// es siempre sí, porque el aparato es la fuente de la verdad. Con un alojamiento
		// en la nube deja de serlo: el archivo diría "12 notas" con 400 arriba, y
		// "Reemplazar todo" —que desde la spec 039 también reclama la cuenta— borraría
		// las otras 388 en todos los aparatos. Por eso el archivo lo declara desde ahora
		// (spec 040, regla 6), aunque hoy la respuesta sea siempre la misma.
		complete: true,
		counts,
		data
	};
}

export function backupFileName(date) {
	const pad = (value) => String(value).padStart(2, '0');
	const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
	return `copynotes-backup-${stamp}.json`;
}
