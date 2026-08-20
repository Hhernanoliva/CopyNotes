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
const backupWith = (blocks) => ({ formatVersion: 6, complete: true, data: { blocks } });
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
		const zip = await buildZip([
			{ name: 'backup.json', blob: new Blob([JSON.stringify(backupWith([{ type: 'image', imageId: ID }]))]) },
			{ name: `images/${ID}.png`, blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('hash-mismatch');
	});

	it('un .json que dice ser versión 6 se rechaza: los bytes no pueden estar ahí', async () => {
		const plain = new TextEncoder().encode(JSON.stringify({ formatVersion: 6 }));
		expect((await readPackage(plain)).status).toBe('not-a-package');
	});
});
