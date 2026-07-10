// Clipboard access lives behind this wrapper so a future Tauri desktop build
// can swap the implementation without touching the editor (AGENT.md portability).

export async function writeToClipboard({ text, html }) {
	if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					'text/plain': new Blob([text], { type: 'text/plain' }),
					'text/html': new Blob([html], { type: 'text/html' })
				})
			]);
			return;
		} catch {
			// Rich write unsupported or denied; plain text below still covers the paste.
		}
	}
	await navigator.clipboard.writeText(text);
}
