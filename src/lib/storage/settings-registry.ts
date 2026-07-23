// Single source of truth for preference keys and their backup policy.
//
// Dependency-free on purpose: this module must NOT import the database layer,
// so pure modules (export-import/merge.ts, export-import/backup.ts) can import
// it and keep running under Node without IndexedDB.
//
// `backupSafe` = the preference may leave the device inside an exported backup
// file and be restored from one. Anything else (session tokens, licence keys,
// sync cursors — none exist yet) must stay false so it never lands in a
// plaintext backup. The flag is scoped on purpose: when cloud sync or MCP
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
	connectedAgent: 'connectedAgent'
};

export const SETTINGS = {
	[KEY.theme]: { backupSafe: true },
	[KEY.hasCompletedOnboarding]: { backupSafe: true },
	[KEY.lastOpenedNoteId]: { backupSafe: true },
	[KEY.demoNoteCreated]: { backupSafe: true },
	[KEY.agendaHideCompleted]: { backupSafe: true },
	[KEY.editorTextScale]: { backupSafe: true },
	[KEY.connectedAgent]: { backupSafe: false } // Local MCP connection identity — device-only, never leaves in a backup (cloud is spec 029).
};

export const SETTING_KEYS = Object.keys(SETTINGS);

export const SAFE_SETTING_KEYS = SETTING_KEYS.filter((key) => SETTINGS[key].backupSafe);

export function isBackupSafe(key) {
	return SETTINGS[key]?.backupSafe === true;
}
