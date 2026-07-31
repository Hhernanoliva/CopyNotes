// Where the desktop build lives, and when it is worth suggesting it.
//
// The desktop app is what MCP agents talk to; the web app cannot host that
// bridge. So the web build points people at the download instead of at the
// old PWA install, which produced a look-alike app that agents cannot use.
//
// The URL lives here because two places need it: the dismissable banner and
// the Agents section of Settings.

export const DESKTOP_DOWNLOAD_URL = 'https://github.com/Hhernanoliva/CopyNotes/releases';

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
