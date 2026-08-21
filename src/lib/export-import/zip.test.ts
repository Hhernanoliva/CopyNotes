import { describe, expect, it } from 'vitest';
import { buildZip, readZip } from './zip';

const text = (value) => new Blob([new TextEncoder().encode(value)]);
const decode = (bytes) => new TextDecoder().decode(bytes);

describe('el paquete', () => {
	it('lo que entra es lo que sale', async () => {
		const zip = await buildZip([
			{ name: 'backup.json', blob: text('{"formatVersion":6}') },
			{ name: 'images/' + 'a'.repeat(64) + '.png', blob: text('PNGPNGPNG') }
		]);
		const read = readZip(new Uint8Array(await zip.arrayBuffer()));
		expect(read.status).toBe('ok');
		expect(decode(read.entries.get('backup.json'))).toBe('{"formatVersion":6}');
		expect(decode(read.entries.get('images/' + 'a'.repeat(64) + '.png'))).toBe('PNGPNGPNG');
	});

	it('nada se comprime, así que una bomba zip no puede existir', async () => {
		const zip = await buildZip([{ name: 'backup.json', blob: text('a'.repeat(10000)) }]);
		// Con el método STORE el tamaño comprimido ES el tamaño real, así que el
		// archivo entero no puede ser mucho más chico que su contenido.
		expect(zip.size).toBeGreaterThan(10000);
	});

	it('un paquete cortado se rechaza en vez de adivinar', () => {
		expect(readZip(new Uint8Array([1, 2, 3])).status).toBe('not-a-package');
	});

	it('una entrada comprimida se rechaza: nuestro exportador nunca escribe una', async () => {
		const zip = await buildZip([{ name: 'backup.json', blob: text('hola') }]);
		const bytes = new Uint8Array(await zip.arrayBuffer());
		// El método vive en el byte 8 del encabezado local y en el 10 del central.
		bytes[8] = 8;
		expect(readZip(bytes).status).toBe('compressed-entry');
	});

	it('un nombre repetido se rechaza', async () => {
		const zip = await buildZip([
			{ name: 'backup.json', blob: text('uno') },
			{ name: 'backup.json', blob: text('dos') }
		]);
		expect(readZip(new Uint8Array(await zip.arrayBuffer())).status).toBe('duplicate-entry');
	});
});
