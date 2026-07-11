// Clipboard access lives behind this wrapper so a future Tauri desktop build
// can swap the implementation without touching the editor (AGENT.md portability).

import { CLIPBOARD_FORMAT, rememberCopy } from './serialize';

// text/plain + text/html always; when `custom` is given, also write CopyNotes'
// own format so an internal paste can rebuild exact blocks. Browsers without
// custom-format support fall back to text+html, then to plain text — and the
// localStorage buffer (rememberCopy) makes an internal paste work regardless.
export async function writeToClipboard({ text, html, custom }) {
	if (custom) rememberCopy(text, custom);
	if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
		const base = {
			'text/plain': new Blob([text], { type: 'text/plain' }),
			'text/html': new Blob([html], { type: 'text/html' })
		};
		const attempts = [];
		if (custom) {
			attempts.push({
				...base,
				[CLIPBOARD_FORMAT]: new Blob([custom], { type: CLIPBOARD_FORMAT })
			});
		}
		attempts.push(base);
		for (const items of attempts) {
			try {
				await navigator.clipboard.write([new ClipboardItem(items)]);
				return;
			} catch {
				// Try the next, less-rich shape (e.g. custom format unsupported).
			}
		}
	}
	await navigator.clipboard.writeText(text);
}
