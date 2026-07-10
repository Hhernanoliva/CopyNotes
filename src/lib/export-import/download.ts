// Browser download wrapper. Kept as a tiny utility (like copy/clipboard.ts)
// so a future Tauri build can swap in a native save dialog without touching
// the export flows. Works offline: the file is built entirely in memory.

export function downloadFile(fileName, content, mimeType) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
	return file.text();
}
