import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, detectImageType, prepareImage, sha256Hex } from './ingest';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const measures = (width, height) => async () => ({ width, height });
const file = (bytes, name = 'image.png', type = 'image/png') => new File([bytes], name, { type });

describe('la firma real manda, no el nombre ni el tipo declarado', () => {
	it('reconoce los cuatro formatos aceptados', () => {
		expect(detectImageType(PNG)).toBe('image/png');
		expect(detectImageType(JPEG)).toBe('image/jpeg');
		expect(detectImageType(WEBP)).toBe('image/webp');
		expect(detectImageType(GIF)).toBe('image/gif');
	});

	it('rechaza un SVG, que es un documento con programa adentro', () => {
		expect(detectImageType(SVG)).toBe(null);
	});

	it('un .png que por dentro no es PNG se rechaza', async () => {
		const result = await prepareImage(file(SVG, 'trampa.png', 'image/png'), measures(10, 10));
		expect(result.status).toBe('not-an-image');
	});
});

describe('preparar una captura', () => {
	it('devuelve la huella, el tipo, el peso y las medidas', async () => {
		const result = await prepareImage(file(PNG), measures(3018, 1312));
		expect(result.status).toBe('ready');
		expect(result.imageId).toMatch(/^[0-9a-f]{64}$/);
		expect(result.imageId).toBe(await sha256Hex(PNG.buffer));
		expect(result.type).toBe('image/png');
		expect(result.bytes).toBe(16);
		expect(result.width).toBe(3018);
		expect(result.height).toBe(1312);
	});

	it('la misma captura da siempre la misma huella', async () => {
		const a = await prepareImage(file(PNG), measures(2, 2));
		const b = await prepareImage(file(PNG), measures(2, 2));
		expect(a.imageId).toBe(b.imageId);
	});

	it('rechaza por PESO, y lo hace antes de leer el archivo', async () => {
		const huge = { size: MAX_IMAGE_BYTES + 1, arrayBuffer: () => { throw new Error('no se debe leer'); } };
		const result = await prepareImage(huge, measures(2, 2));
		expect(result.status).toBe('too-large');
		expect(result.bytes).toBe(MAX_IMAGE_BYTES + 1);
	});

	it('el tope es 5 MB y va en bytes, nunca en píxeles', async () => {
		expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
		// Medido (spec 041 §2): 4 megapíxeles pesan 325 KB y 0,3 megapíxeles pesan
		// 345 KB. Un tope por píxeles achica la que no molesta y deja pasar la que sí.
		const enorme = await prepareImage(file(PNG), measures(6000, 6000));
		expect(enorme.status).toBe('ready');
	});

	it('un archivo que no se puede decodificar se rechaza', async () => {
		const result = await prepareImage(file(PNG), async () => null);
		expect(result.status).toBe('undecodable');
	});
});
