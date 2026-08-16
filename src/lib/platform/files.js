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
			//
			// Esta espera era de 100 ms y se comía el respaldo. Cuando el diálogo del
			// sistema se cierra, la ventana recupera el foco ANTES de que llegue el
			// aviso del archivo elegido; si ese aviso tardaba un poco más que la espera,
			// esto resolvía "canceló" y el archivo se tiraba **en silencio** — ni
			// resumen ni error, que es la peor forma de fallar. Reportado en la web el
			// 2026-08-16 (sitio publicado, localhost y iPhone, los tres igual).
			//
			// Ningún test lo veía: Playwright pone el archivo con `setFiles`, sin
			// diálogo nativo, así que la ventana nunca pierde el foco y este camino no
			// se ejecuta. En la app de escritorio tampoco se notaba.
			//
			// Un segundo y medio no se percibe: lo único que demora es la conclusión de
			// que cancelaste, y cancelar no hace nada de todos modos. Elegir un archivo
			// sigue siendo instantáneo, porque lo resuelve `change`.
			//
			// ponytail: sigue siendo una espera y no un hecho — un `change` que llegue
			// después de la espera se pierde igual. El día que se pueda dar por muerto
			// al Safari sin evento `cancel`, esta rama entera se borra.
			focusTimer = setTimeout(() => {
				if (!input.files?.length) finish(null);
			}, 1500);
		};
		input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
		input.addEventListener('cancel', () => finish(null), { once: true });
		window.addEventListener('focus', handleWindowFocus, { once: true });
		document.body.append(input);
		input.click();
	});
}

// Reading a file puts it in memory as a string, and whoever asked for it then
// parses it into objects — so the tab holds it twice over. Without a ceiling, a
// wrong pick (a video, a database dump) freezes the page before anything can say
// what happened. 64 MB is far past any real backup: the file is note text, and
// the whole thing is one JSON of what you typed.
export const MAX_TEXT_FILE_BYTES = 64 * 1024 * 1024;

export async function openTextFile({ accept = '' } = {}) {
	const file = await chooseFile(accept);
	if (!file) return { status: 'cancelled' };
	// Checked BEFORE reading: `file.size` is metadata the browser already has,
	// so nothing large is ever pulled into memory to find out it was too large.
	if (file.size > MAX_TEXT_FILE_BYTES) return { status: 'too-large', fileName: file.name };
	return { status: 'opened', fileName: file.name, content: await file.text() };
}
