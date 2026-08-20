// El paquete `.copynotes` (spec 041 §5): un ZIP de verdad —Task 8, `zip.ts`—
// con `backup.json`, `README.txt` y una `images/<huella>.<ext>` por captura.
// Se arma acá; Task 10 lo cuelga de los botones de exportar/importar.

import { buildZip, readZip } from './zip';
import { sha256Hex, MAX_IMAGE_BYTES } from '../images/ingest';
import { backupFileName } from './backup';
import { PACKAGE_VERSION } from './schema';

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
// arrastra una entrada que el propio lector va a rechazar.
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

	// `buildPackage` es la única función que sabe que está armando un paquete
	// — dejarle el sello a quien la llama es dejar que alguien se olvide, y el
	// olvido no se nota hasta que Task 10 escribe un `.copynotes` cuyo propio
	// manifiesto dice versión 5.
	const manifest = { ...backup, formatVersion: PACKAGE_VERSION, images, complete };
	const blob = await buildZip([
		{ name: 'backup.json', blob: new Blob([JSON.stringify(manifest)]) },
		{ name: 'README.txt', blob: new Blob([README]) },
		...entries
	]);
	return { blob, complete };
}

// Cuatro pasadas, en este orden, y el orden es el punto:
//
// (a) ubicar y parsear `backup.json` — sin manifiesto no hay con qué comparar
//     nada de lo que sigue.
// (b) cada nombre de entrada contra la lista blanca.
// (c) lo barato: cuenta de entradas, tamaño de cada una, tamaño declarado, y
//     si cada `images/` está referenciada y con la extensión que el
//     manifiesto dice — todo sin calcular una sola huella.
// (d) lo caro: la huella de cada imagen.
//
// El tope de 5 MB sólo cumple su función ANTES de la huella: un chequeo de
// tamaño que corre después de hashear ya pagó el costo que existía para
// evitar. Y como el ZIP es STORE nomás (spec §5.2), el tamaño que `readZip`
// declara por entrada es el tamaño real — no hay nada que descomprimir para
// que mienta.
export async function readPackage(bytes) {
	const zip = readZip(bytes);
	if (zip.status !== 'ok') return { status: zip.status };

	// (a)
	const backupEntry = zip.entries.get('backup.json');
	if (!backupEntry) return { status: 'not-a-package' };
	let backup;
	try {
		backup = JSON.parse(new TextDecoder().decode(backupEntry));
	} catch {
		return { status: 'not-a-package' };
	}
	// `JSON.parse` acepta `null`, `42`, `"x"` o `[]` sin quejarse; un backup de
	// verdad es siempre un objeto.
	if (typeof backup !== 'object' || backup === null || Array.isArray(backup)) {
		return { status: 'not-a-package' };
	}
	const declaredImages = Array.isArray(backup.images) ? backup.images : [];
	const declaredById = new Map();
	for (const meta of declaredImages) if (meta && typeof meta === 'object') declaredById.set(meta.imageId, meta);
	const referenced = referencedImageIds(Array.isArray(backup.data?.blocks) ? backup.data.blocks : []);

	// (b) — lista blanca, no negra: cualquier nombre que no sea exactamente
	// `backup.json`, `README.txt` o `images/<huella>.<ext>` se rechaza acá,
	// antes de tocar el contenido — incluida una ruta como
	// `images/../../etc/passwd`.
	const imageEntries = [];
	for (const [name, data] of zip.entries) {
		if (name === 'backup.json' || name === 'README.txt') continue;
		const match = NAME_PATTERN.exec(name);
		if (!match) return { status: 'bad-entry-name' };
		imageEntries.push({ data, imageId: match[1], ext: match[2] });
	}

	// (c) — cuenta contra lo declarado.
	if (zip.entries.size > declaredImages.length + 2) return { status: 'too-many-entries' };

	let declaredTotal = 0;
	for (const meta of declaredImages) {
		if (Number.isInteger(meta?.bytes) && meta.bytes >= 0) declaredTotal += meta.bytes;
	}
	let actualTotal = 0;
	for (const entry of imageEntries) {
		if (entry.data.length > MAX_IMAGE_BYTES) return { status: 'entry-too-large' };
		actualTotal += entry.data.length;
	}
	if (actualTotal > declaredTotal) return { status: 'package-too-large' };

	// Huérfana (nada la referencia) o el nombre dice un tipo que el
	// manifiesto contradice — ambas son la misma clase de mentira que el
	// chequeo de huella, sólo que en el nombre en vez de en el contenido.
	for (const entry of imageEntries) {
		if (!referenced.has(entry.imageId)) return { status: 'orphan-entry' };
		const meta = declaredById.get(entry.imageId);
		if (meta && EXTENSION_BY_TYPE[meta.type] !== entry.ext) return { status: 'type-mismatch' };
	}

	// (d) — el nombre lo puso quien armó el archivo; la huella real la dicen
	// los bytes. Content addressing sólo vale mientras alguien lo comprueba.
	const images = new Map();
	for (const entry of imageEntries) {
		if ((await sha256Hex(entry.data)) !== entry.imageId) return { status: 'hash-mismatch' };
		images.set(entry.imageId, entry.data);
	}

	// §5.4 otra vez, del lado de lectura: `complete` es una afirmación del
	// archivo sobre sí mismo, y un archivo no es testigo confiable de su
	// propia integridad. Una que dice `false` honestamente se lee igual —
	// para eso se escribe. Una que dice `true` se vuelve a comprobar, y si no
	// da, se rechaza entera con su propio status — nunca se la corrige en
	// silencio, porque eso es lo que hace que un respaldo dañado se vea sano.
	// Ausente cuenta como `true` (misma convención que `backupSchema`, spec 040
	// regla 6): un manifiesto sin el campo también está afirmando estar entero.
	const claimsComplete = backup.complete !== false;
	if (claimsComplete) {
		let verified = true;
		for (const id of referenced) {
			const meta = declaredById.get(id);
			const data = images.get(id);
			if (!data || !meta || data.length !== meta.bytes) {
				verified = false;
				break;
			}
		}
		if (!verified) return { status: 'incomplete-claim' };
	}

	return { status: 'ok', backup, images };
}
