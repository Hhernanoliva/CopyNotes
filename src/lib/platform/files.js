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

// Cinco minutos: más de lo que tarda cualquier diálogo del sistema, y suficiente
// para que un archivo grande de iCloud termine de copiarse. No es un plazo de espera,
// es un seguro contra una promesa que quede colgada.
const NEVER_HANG_MS = 5 * 60 * 1000;

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
		let safetyTimer = null;
		const finish = (file) => {
			if (settled) return;
			settled = true;
			if (safetyTimer !== null) clearTimeout(safetyTimer);
			input.remove();
			resolve(file ?? null);
		};
		// Cancelar lo dice el navegador y NADIE más.
		//
		// Acá había una adivinanza: cuando la ventana recuperaba el foco —o sea, cuando
		// el diálogo del sistema se cerraba— se esperaba un rato y, si el archivo no
		// había llegado, se daba por cancelado. Pero el foco vuelve ANTES de que llegue
		// el archivo, así que la adivinanza le corría una carrera al sistema operativo
		// y la perdía. Perder ahí es tirar el archivo **en silencio**: ni resumen ni
		// error, que es la peor forma de fallar.
		//
		// Con 100 ms fallaba en Chrome. Con 1500 ms Chrome andaba y el iPhone seguía
		// fallando, porque iOS tiene que COPIAR el archivo desde Archivos/iCloud antes
		// de entregarlo y eso tarda segundos. Cualquier número es el número equivocado:
		// no hay plazo que se pueda saber de antemano. Los dos casos están en
		// `files.test.js`.
		//
		// Ningún test automático lo vio, y no era mala suerte: Playwright entrega el
		// archivo con `setFiles`, sin diálogo nativo, así que la ventana nunca pierde el
		// foco y este camino no se ejecutaba. En la .app de escritorio tampoco pasaba
		// (otro motor, otro orden de eventos). Sólo falla con un diálogo de verdad.
		//
		// El reloj que queda NO decide nada: es una red para que la promesa no quede
		// colgada para siempre en un navegador viejo sin evento `cancel` (Safari < 16.4).
		// Es larguísimo a propósito, y su único efecto posible es resolver "canceló"
		// cuando ya no hay nadie mirando — cancelar no hace nada de todos modos.
		input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
		input.addEventListener('cancel', () => finish(null), { once: true });
		safetyTimer = setTimeout(() => finish(input.files?.[0]), NEVER_HANG_MS);
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

// El mismo diálogo que `openTextFile`, sin leer el archivo a texto: una captura
// no es texto y `file.text()` la rompería. El tope lo pone el ingestor
// (`images/ingest.ts`), que sabe cuál es el de una imagen.
//
// Devuelve una lista aunque el diálogo entregue un archivo solo: pegar y
// arrastrar sí pueden traer varias, y las tres puertas comparten el mismo
// camino de inserción.
export async function openImageFiles() {
	const file = await chooseFile('image/*');
	if (!file) return { status: 'cancelled' };
	return { status: 'opened', files: [file] };
}

// El gemelo de `saveTextFile` para bytes. Recibe el Blob ya armado porque quien
// llama es el que sabe cómo se arma el paquete.
export async function saveBinaryFile({ fileName, blob }) {
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

export async function openBinaryFile({ accept = '' } = {}) {
	const file = await chooseFile(accept);
	if (!file) return { status: 'cancelled' };
	return { status: 'opened', fileName: file.name, bytes: await file.arrayBuffer() };
}
