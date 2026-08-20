import { describe, expect, it } from 'vitest';
import { buildPackage, packageFileName, readPackage, referencedImageIds } from './package';

// La huella real de los 4 bytes que `png()` produce (SHA-256 de
// [0x89, 0x50, 0x4e, 0x47]). No es un valor de relleno: `buildPackage` y
// `readPackage` verifican de verdad que el nombre de archivo es la huella del
// contenido, así que un id inventado le rompería el redondeo a "con todos los
// cuerpos, se declara completo" — el propio contenido no hashea a 'a'
// repetida. `OTHER` no participa de ninguna verificación de huella (sólo se
// usa como un segundo id distinguible), así que se queda como estaba.
const ID = '0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543';
const OTHER = 'b'.repeat(64);
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
// formatVersion 5: lo que un llamador real manda ANTES de empaquetar
// (`buildBackup` siempre emite `CURRENT_VERSION`, que es 5). `buildPackage`
// es quien tiene que estampar el 6 — si esta fixture ya mandara un 6, la
// prueba de más abajo no probaría nada.
const backupWith = (blocks) => ({ formatVersion: 5, complete: true, data: { blocks } });
const body = (imageId) => ({ imageId, blob: png(), type: 'image/png', bytes: 4, width: 2, height: 2 });

describe('las referencias', () => {
	it('la papelera también cuenta: un bloque borrado sigue apuntando a su imagen', () => {
		const ids = referencedImageIds([
			{ type: 'image', imageId: ID, deletedAt: null },
			{ type: 'image', imageId: OTHER, deletedAt: '2026-08-01T00:00:00.000Z' }
		]);
		expect([...ids].sort()).toEqual([ID, OTHER].sort());
	});
});

describe('armar el paquete', () => {
	it('el nombre lleva la extensión propia', () => {
		expect(packageFileName(new Date('2026-08-20T15:04:00'))).toBe(
			'copynotes-backup-2026-08-20-1504.copynotes'
		);
	});

	it('con todos los cuerpos, se declara completo', async () => {
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), [body(ID)]);
		expect(result.complete).toBe(true);
		const read = await readPackage(new Uint8Array(await result.blob.arrayBuffer()));
		expect(read.status).toBe('ok');
		expect(read.backup.formatVersion).toBe(6);
		expect(read.images.get(ID)).toBeDefined();
	});

	it('si falta un cuerpo NO miente: sale igual, y dice que está incompleto', async () => {
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), []);
		expect(result.complete).toBe(false);
		const read = await readPackage(new Uint8Array(await result.blob.arrayBuffer()));
		expect(read.backup.complete).toBe(false);
	});

	it('un cuerpo cuyo largo no coincide con lo declarado: incompleto, y no entra al ZIP', async () => {
		const badBody = { ...body(ID), bytes: 999 };
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), [badBody]);
		expect(result.complete).toBe(false);
		const { readZip } = await import('./zip');
		const zip = readZip(new Uint8Array(await result.blob.arrayBuffer()));
		expect([...zip.entries.keys()].some((name) => name.startsWith('images/'))).toBe(false);
	});

	it('un cuerpo cuyo blob no hashea al imageId declarado: incompleto', async () => {
		const wrongHashBody = {
			imageId: ID,
			blob: new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/png' }),
			type: 'image/png',
			bytes: 4,
			width: 2,
			height: 2
		};
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), [wrongHashBody]);
		expect(result.complete).toBe(false);
	});
});

describe('leer el paquete: lo que rechaza antes de tocar nada', () => {
	const withName = async (name) => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{ name: 'backup.json', blob: new Blob([JSON.stringify(backupWith([]))]) },
			{ name, blob: png() }
		]);
		return await readPackage(new Uint8Array(await zip.arrayBuffer()));
	};

	it('rechaza una ruta que sale de la carpeta', async () => {
		expect((await withName('images/../../etc/passwd')).status).toBe('bad-entry-name');
	});

	it('rechaza un nombre que no es una huella', async () => {
		expect((await withName('images/gato.png')).status).toBe('bad-entry-name');
	});

	it('rechaza un archivo cuya huella no coincide con su nombre', async () => {
		const { buildZip } = await import('./zip');
		// El manifiesto declara la imagen correctamente (cuenta, peso, tipo) para
		// que el fallo que se prueba acá sea la huella — no uno de los gates
		// baratos de la sección de abajo, que ya tienen su propia prueba.
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					JSON.stringify({
						...backupWith([{ type: 'image', imageId: ID }]),
						images: [{ imageId: ID, type: 'image/png', bytes: 4, width: 1, height: 1 }]
					})
				])
			},
			{ name: `images/${ID}.png`, blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('hash-mismatch');
	});

	it('un .json que dice ser versión 6 se rechaza: los bytes no pueden estar ahí', async () => {
		const plain = new TextEncoder().encode(JSON.stringify({ formatVersion: 6 }));
		expect((await readPackage(plain)).status).toBe('not-a-package');
	});

	it('un backup.json que no parsea a un objeto (null, número, array) se rechaza', async () => {
		const { buildZip } = await import('./zip');
		for (const value of [null, 42, [1, 2]]) {
			const zip = await buildZip([{ name: 'backup.json', blob: new Blob([JSON.stringify(value)]) }]);
			expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('not-a-package');
		}
	});
});

describe('leer el paquete: lo barato antes de lo caro (§5.3/§5.4)', () => {
	const manifestWith = ({ blocks = [], images = [], complete = true } = {}) =>
		JSON.stringify({ ...backupWith(blocks), images, complete });

	it('más entradas de imagen que las que el manifiesto declara: too-many-entries', async () => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{ name: 'backup.json', blob: new Blob([manifestWith({ images: [] })]) },
			{ name: `images/${ID}.png`, blob: png() },
			{ name: `images/${OTHER}.png`, blob: png() }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('too-many-entries');
	});

	it('una sola entrada por encima de 5 MB: entry-too-large, sin calcular una huella', async () => {
		const { buildZip } = await import('./zip');
		const { MAX_IMAGE_BYTES } = await import('../images/ingest');
		const huge = new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' });
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					manifestWith({
						blocks: [{ type: 'image', imageId: ID }],
						images: [{ imageId: ID, type: 'image/png', bytes: MAX_IMAGE_BYTES + 1, width: 1, height: 1 }]
					})
				])
			},
			{ name: `images/${ID}.png`, blob: huge }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('entry-too-large');
	});

	it('el peso real de las imágenes supera el total que el manifiesto declaró: package-too-large', async () => {
		const { buildZip } = await import('./zip');
		// El contenido SÍ hashea a ID (huella real de png()) — la única cosa mal es
		// el `bytes` declarado. Si el orden fuera "hashear primero", esta prueba
		// pasaría igual por una razón equivocada; el gate de tamaño tiene que
		// pararla antes de llegar ahí.
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					manifestWith({
						blocks: [{ type: 'image', imageId: ID }],
						images: [{ imageId: ID, type: 'image/png', bytes: 1, width: 1, height: 1 }]
					})
				])
			},
			{ name: `images/${ID}.png`, blob: png() }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('package-too-large');
	});

	it('una imagen que ningún bloque referencia: orphan-entry', async () => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					manifestWith({
						blocks: [],
						images: [{ imageId: ID, type: 'image/png', bytes: 4, width: 2, height: 2 }]
					})
				])
			},
			{ name: `images/${ID}.png`, blob: png() }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('orphan-entry');
	});

	it('la extensión del archivo no es la del tipo que el manifiesto declaró: type-mismatch', async () => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					manifestWith({
						blocks: [{ type: 'image', imageId: ID }],
						images: [{ imageId: ID, type: 'image/gif', bytes: 4, width: 2, height: 2 }]
					})
				])
			},
			{ name: `images/${ID}.png`, blob: png() }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('type-mismatch');
	});

	it('dice completo pero le falta el cuerpo: incomplete-claim, no se lo corrige en silencio', async () => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{
				name: 'backup.json',
				blob: new Blob([
					manifestWith({
						blocks: [{ type: 'image', imageId: ID }],
						images: [{ imageId: ID, type: 'image/png', bytes: 4, width: 2, height: 2 }],
						complete: true
					})
				])
			}
			// sin `images/${ID}.png`: el cuerpo nunca llegó al paquete.
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('incomplete-claim');
	});
});
