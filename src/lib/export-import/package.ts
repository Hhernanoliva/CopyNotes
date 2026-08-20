// El paquete `.copynotes` (spec 041 §5): un ZIP de verdad —Task 8, `zip.ts`—
// con `backup.json`, `README.txt` y una `images/<huella>.<ext>` por captura.
// Se arma acá; Task 10 lo cuelga de los botones de exportar/importar.

import { buildZip, readZip } from './zip';
import { sha256Hex } from '../images/ingest';
import { backupFileName } from './backup';

export const EXTENSION_BY_TYPE = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const NAME_PATTERN = /^images\/([0-9a-f]{64})\.(png|jpg|webp|gif)$/;

const README = `Esto es un respaldo de CopyNotes.

Adentro hay:

- backup.json: el contenido de tus notas, en texto plano. Se puede abrir con
  cualquier editor de texto (Bloc de notas, TextEdit, o el que tengas a mano).
- Una carpeta "images" con las capturas de pantalla que pegaste en tus notas.

Este respaldo también lleva lo que borraste (la papelera), para que nada se
pierda por el camino.

Para volver a cargarlo, usá el botón "Importar" dentro de CopyNotes — no hace
falta descomprimir nada a mano.
`;

// Todo `imageId` que un bloque referencia, papelera incluida: un bloque
// borrado sigue apuntando a su imagen (spec §9.1), así que una nota vaciada a
// la papelera también produce un `.copynotes`.
export function referencedImageIds(blocks) {
	const ids = new Set();
	for (const block of blocks) {
		if (block.imageId) ids.add(block.imageId);
	}
	return ids;
}

export function packageFileName(date) {
	return backupFileName(date).replace(/\.json$/, '.copynotes');
}

// `bodies` es lo que la base local tiene a mano: `{ imageId, blob, type, bytes,
// width, height }` por captura. `complete` sale de comprobar, para cada id que
// el respaldo referencia, que hay un cuerpo, que pesa lo que dice pesar y que
// su huella real es el propio id — nunca de copiar lo que el llamador puso en
// `backup.complete`. Un cuerpo que no pasa esa prueba queda afuera del ZIP: un
// paquete a medias que igual se puede volver a leer es mejor que uno que
// arrastra una entrada que el propio lector va a rechazar (el tipo, ancho y
// alto de cada imagen quedan en `backup.images`, no hace falta repetirlos).
export async function buildPackage(backup, bodies) {
	const referenced = referencedImageIds(backup.data.blocks);
	// `new Map()` vacío y `.set()`, no `new Map(bodies.map(...))`: con
	// `noImplicitAny` apagado, TS infiere `bodies` como `any`, y construir el
	// Map a partir de un array `any` lo tipa `Map<unknown, unknown>` en vez de
	// `Map<any, any>` — un vacío de este mismo tsconfig, no algo especial de
	// acá (el mismo patrón vacío ya se usa en `blocks/cascade.ts`, `zip.ts`).
	const byId = new Map();
	for (const entry of bodies) byId.set(entry.imageId, entry);

	const images = [];
	const entries = [];
	let complete = true;

	for (const imageId of referenced) {
		const found = byId.get(imageId);
		const buffer = found ? await found.blob.arrayBuffer() : null;
		const ok = found && buffer.byteLength === found.bytes && (await sha256Hex(buffer)) === imageId;
		if (!ok) {
			complete = false;
			continue;
		}
		images.push({
			imageId,
			type: found.type,
			bytes: found.bytes,
			width: found.width,
			height: found.height
		});
		entries.push({ name: `images/${imageId}.${EXTENSION_BY_TYPE[found.type]}`, blob: found.blob });
	}

	const manifest = { ...backup, images, complete };
	const blob = await buildZip([
		{ name: 'backup.json', blob: new Blob([JSON.stringify(manifest)]) },
		{ name: 'README.txt', blob: new Blob([README]) },
		...entries
	]);
	return { blob, complete };
}

// `readZip` primero: un `.json` suelto que dice `formatVersion: 6` no tiene
// forma de ZIP, así que ya sale de acá como `not-a-package` sin que este
// módulo tenga que mirar el contenido para saber que miente.
export async function readPackage(bytes) {
	const zip = readZip(bytes);
	if (zip.status !== 'ok') return { status: zip.status };

	const images = new Map();
	let backupBytes = null;
	for (const [name, data] of zip.entries) {
		if (name === 'backup.json') {
			backupBytes = data;
			continue;
		}
		if (name === 'README.txt') continue;
		// Lista blanca, no negra: cualquier nombre que no sea exactamente
		// `backup.json`, `README.txt` o `images/<huella>.<ext>` se rechaza acá,
		// antes de tocar el contenido — incluida una ruta como
		// `images/../../etc/passwd`.
		const match = NAME_PATTERN.exec(name);
		if (!match) return { status: 'bad-entry-name' };
		const [, imageId] = match;
		// El nombre lo puso quien armó el archivo; la huella real la dicen los
		// bytes. Content addressing sólo vale mientras alguien lo comprueba.
		if ((await sha256Hex(data)) !== imageId) return { status: 'hash-mismatch' };
		images.set(imageId, data);
	}
	if (!backupBytes) return { status: 'not-a-package' };

	let backup;
	try {
		backup = JSON.parse(new TextDecoder().decode(backupBytes));
	} catch {
		return { status: 'not-a-package' };
	}
	return { status: 'ok', backup, images };
}
