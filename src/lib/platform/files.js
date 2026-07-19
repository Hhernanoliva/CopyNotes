// Async from day one: the browser implementation starts a download or opens a
// file input; a future Tauri adapter can return the same results after native
// save/open dialogs without changing any screen.

export async function saveTextFile({ fileName, content, mimeType }) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
	return { status: 'saved', fileName };
}

function chooseFile(accept) {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.tabIndex = -1;
		input.setAttribute('aria-hidden', 'true');
		input.style.position = 'fixed';
		input.style.width = '1px';
		input.style.height = '1px';
		input.style.opacity = '0';
		input.style.pointerEvents = 'none';
		let settled = false;
		let focusTimer = null;
		const finish = (file) => {
			if (settled) return;
			settled = true;
			if (focusTimer !== null) clearTimeout(focusTimer);
			window.removeEventListener('focus', handleWindowFocus);
			input.remove();
			resolve(file ?? null);
		};
		const handleWindowFocus = () => {
			// Older Safari has no input `cancel` event. Let a possible `change`
			// arrive first, then treat an empty selection as cancellation.
			focusTimer = setTimeout(() => {
				if (!input.files?.length) finish(null);
			}, 100);
		};
		input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
		input.addEventListener('cancel', () => finish(null), { once: true });
		window.addEventListener('focus', handleWindowFocus, { once: true });
		document.body.append(input);
		input.click();
	});
}

export async function openTextFile({ accept = '' } = {}) {
	const file = await chooseFile(accept);
	if (!file) return { status: 'cancelled' };
	return { status: 'opened', fileName: file.name, content: await file.text() };
}
