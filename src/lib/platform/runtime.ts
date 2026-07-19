// Runtime identity stays in one place so components never inspect Tauri
// globals independently. Tauri 2 exposes __TAURI_INTERNALS__ in its webview.

export function getRuntimeKind() {
	if (
		typeof window !== 'undefined' &&
		('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
	) {
		return 'tauri';
	}
	return 'web';
}

export function isTauriRuntime() {
	return getRuntimeKind() === 'tauri';
}

export function getBackupSource() {
	return isTauriRuntime() ? 'desktop' : 'pwa';
}
