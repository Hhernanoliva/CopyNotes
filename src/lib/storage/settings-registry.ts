// Single source of truth for preference keys and their backup policy.
//
// Dependency-free on purpose: this module must NOT import the database layer,
// so pure modules (export-import/merge.ts, export-import/backup.ts) can import
// it and keep running under Node without IndexedDB.
//
// `backupSafe` = the preference may leave the device inside an exported backup
// file and be restored from one. Anything else (session tokens, licence keys,
// the sync cursor and the upload consent below) must stay false so it never
// lands in a plaintext backup. The flag is scoped on purpose: when cloud sync or MCP
// arrive, add sibling flags (e.g. cloudSync, mcpExposable) rather than
// overloading this one.

// Key names declared once here; settings.ts reads/writes through these so a
// preference name never drifts between the store and its backup policy.
export const KEY = {
	theme: 'theme',
	hasCompletedOnboarding: 'hasCompletedOnboarding',
	lastOpenedNoteId: 'lastOpenedNoteId',
	demoNoteCreated: 'demoNoteCreated',
	agendaHideCompleted: 'agendaHideCompleted',
	editorTextScale: 'editorTextScale',
	sidebarWidth: 'sidebarWidth',
	zoomRootByNote: 'zoomRootByNote',
	connectedAgent: 'connectedAgent',
	agentsPaused: 'agentsPaused',
	processedChanges: 'processedChanges',
	syncConsent: 'syncConsent',
	syncUploadedThrough: 'syncUploadedThrough',
	syncDownloadedThrough: 'syncDownloadedThrough',
	syncAccountId: 'syncAccountId',
	shareOwnerLabel: 'shareOwnerLabel'
};

export const SETTINGS = {
	[KEY.theme]: { backupSafe: true },
	[KEY.hasCompletedOnboarding]: { backupSafe: true },
	[KEY.lastOpenedNoteId]: { backupSafe: true },
	[KEY.demoNoteCreated]: { backupSafe: true },
	[KEY.agendaHideCompleted]: { backupSafe: true },
	[KEY.editorTextScale]: { backupSafe: true },
	[KEY.sidebarWidth]: { backupSafe: true },
	[KEY.zoomRootByNote]: { backupSafe: false }, // Dónde quedó parada ESTA persona dentro de cada nota, en ESTE aparato (spec 043). No es un dato de la nota: restaurar un respaldo no debe mover a nadie de lugar, y un aparato nuevo arranca viendo las notas enteras.
	[KEY.connectedAgent]: { backupSafe: false }, // Local MCP connection identity — device-only, never leaves in a backup (cloud is spec 029).
	[KEY.agentsPaused]: { backupSafe: false }, // The master agent kill switch. NOT backup-safe on purpose: import only writes safe keys, so restoring a file can never un-pause a device the user paused.
	[KEY.processedChanges]: { backupSafe: false }, // Local agent-change dedupe ledger — device-only, never leaves in a backup (cloud is spec 029).
	[KEY.syncConsent]: { backupSafe: false }, // Consent to upload (spec 030 phase 2) — a decision per device, never restored from a file.
	[KEY.syncUploadedThrough]: { backupSafe: false }, // How far the change counter was uploaded — meaningless on another device, and restoring it would skip records.
	[KEY.syncDownloadedThrough]: { backupSafe: false }, // How far the server's own sequence was read (spec 030 phase 3) — restoring it on another device would skip everything before it, silently.
	[KEY.syncAccountId]: { backupSafe: false }, // Which account the key, the consent and the cursors above belong to (sync/leave.ts). Restoring it from a file would vouch for an account this device never signed into.
	[KEY.shareOwnerLabel]: { backupSafe: true } // Cómo firmás en las notas que compartís (spec 038 §6). Es una preferencia tuya, como el tema: se escribe una vez y viaja en el respaldo. No es un dato de nadie más — el nombre de los invitados vive en `shareMembers`, que a propósito NO es respaldable.
};

// Las claves POR NOTA de compartir (spec 038). No pueden estar en el mapa de
// arriba —hay una por nota, y las notas no se conocen de antemano— así que lo
// declarado es el prefijo.
//
// Que `isBackupSafe` ya devuelva false para una clave desconocida es la
// respuesta correcta por accidente. Se declara igual, porque hay tres lugares
// que leen el REGISTRO y no la tabla: el filtro del respaldo, lo que
// `replaceAllTables` conserva, y `resetCloudState`, que borra clave por clave de
// una lista fija — y una clave por nota no puede estar en una lista fija.
export const SHARE_PREFIX = 'share:';

// cursor  = hasta dónde bajé de esa nota (server_seq)
// visto   = la entrada de bitácora más nueva que esta pantalla mostró (parte B)
// desde   = el sello a partir del cual viaja la bitácora (parte B)
export function shareKey(kind, noteId) {
	return `${SHARE_PREFIX}${kind}:${noteId}`;
}

export function isSharePrefixed(key) {
	return typeof key === 'string' && key.startsWith(SHARE_PREFIX);
}

export const SETTING_KEYS = Object.keys(SETTINGS);

export const SAFE_SETTING_KEYS = SETTING_KEYS.filter((key) => SETTINGS[key].backupSafe);

export function isBackupSafe(key) {
	return SETTINGS[key]?.backupSafe === true;
}
