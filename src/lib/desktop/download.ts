// Where the desktop build lives, and when it is worth suggesting it.
//
// The desktop app is what MCP agents talk to; the web app cannot host that
// bridge. So the web build points people at the download instead of at the
// old PWA install, which produced a look-alike app that agents cannot use.
//
// The URL lives here because two places need it: the dismissable banner and
// the Agents section of Settings.

export const DESKTOP_DOWNLOAD_URL = 'https://github.com/Hhernanoliva/CopyNotes/releases';

// TODO(descarga): flip to true the day the first .app release is published.
// Until then the releases page is empty, so every download entry point is
// hidden rather than sending people to a blank page.
//
// Flipping this switch re-enables, in one go:
//   - the bottom-right banner (DesktopAppPrompt.svelte)
//   - the link in Settings › Agentes (SettingsDialog.svelte)
// and it requires restoring the card/link assertions in
// e2e/desktop-prompt.spec.ts, which currently assert the hidden state.
export const DESKTOP_RELEASE_PUBLISHED = false;

const DISMISS_KEY = 'copynotes-desktop-dismissed';

// Only pitch the desktop app where it could actually run. Callers already
// guard on the runtime (the layout never mounts this inside Tauri), so the
// checks left here are the device and the user's own past answer.
//
// Pointer, not width: a tablet in landscape is as wide as a laptop and still
// cannot install a desktop app.
export function canShowDownloadPrompt(win) {
	if (!win) return false;
	if (!win.matchMedia?.('(pointer: fine)')?.matches) return false;
	try {
		return !win.localStorage.getItem(DISMISS_KEY);
	} catch {
		// Private mode can block storage. Showing the banner is better than
		// crashing the layout over it.
		return true;
	}
}

export function dismissDownloadPrompt(win) {
	try {
		win?.localStorage.setItem(DISMISS_KEY, '1');
	} catch {
		// Ignore: worst case it suggests again next session.
	}
}
