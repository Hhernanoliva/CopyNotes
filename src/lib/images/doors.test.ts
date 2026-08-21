import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageFilesFrom, IMAGE_INSERT_MESSAGES } from './doors';

// `roomIsTight` recuerda si ya pidió `persist()`, así que cada caso se lleva un
// módulo recién cargado: sin esto el test del "una sola vez" sólo pasaba
// mientras fuera el primero del archivo, y lo único que lo cuidaba era un
// comentario.
async function freshRoomIsTight() {
	vi.resetModules();
	return (await import('./doors')).roomIsTight;
}

const fake = (type, size = 1000) => ({ type, size });

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('imageFilesFrom', () => {
	it('deja pasar sólo lo que es una imagen', () => {
		const png = fake('image/png');
		const pdf = fake('application/pdf');
		expect(imageFilesFrom({ files: [png, pdf] })).toEqual([png]);
	});

	// Medido en Safari 26.5: una captura del sistema llega como `image.png`.
	it('acepta la captura tal como la entrega el sistema', () => {
		const shot = { ...fake('image/png'), name: 'image.png' };
		expect(imageFilesFrom({ files: [shot] })).toEqual([shot]);
	});

	// Un pegado normal de texto: el camino de siempre tiene que seguir andando.
	it('un portapapeles sin archivos da una lista vacía', () => {
		expect(imageFilesFrom({ files: [] })).toEqual([]);
	});

	it('un pegado sin NADA —ni archivos ni tipos— tampoco rompe', () => {
		expect(imageFilesFrom(undefined)).toEqual([]);
		expect(imageFilesFrom({})).toEqual([]);
	});

	// Copiar una imagen de una página web trae la dirección como texto, no el
	// archivo. No se descarga nada: no es una imagen que entre.
	it('una dirección copiada de una página no es un archivo', () => {
		expect(imageFilesFrom({ files: [], types: ['text/html', 'text/plain'] })).toEqual([]);
	});
});

describe('IMAGE_INSERT_MESSAGES', () => {
	// Si `insertImageBlock` suma un estado nuevo y nadie le escribe el mensaje,
	// el aviso en pantalla diría "undefined".
	it('cubre todos los finales que no son "ready"', () => {
		expect(Object.keys(IMAGE_INSERT_MESSAGES).sort()).toEqual([
			'failed',
			'not-an-image',
			'shared',
			'too-large',
			'undecodable'
		]);
		for (const message of Object.values(IMAGE_INSERT_MESSAGES)) expect(message).toMatch(/\S/);
	});

	it('habla en castellano y sin jerga', () => {
		expect(IMAGE_INSERT_MESSAGES['too-large']).toBe(
			'Esa imagen pesa más de 5 MB. Probá con una captura más chica.'
		);
		expect(IMAGE_INSERT_MESSAGES['not-an-image']).toBe(
			'Ese archivo no es una imagen que CopyNotes pueda guardar.'
		);
		expect(IMAGE_INSERT_MESSAGES.undecodable).toBe('No se pudo leer esa imagen.');
		expect(IMAGE_INSERT_MESSAGES.failed).toBe(
			'No se pudo guardar la imagen. Puede que no haya espacio.'
		);
	});
});

// Ojo con el orden: el pedido de `persist()` es una vez por sesión, así que este
// bloque tiene que ser el primero que llama a `roomIsTight` en el archivo.
describe('roomIsTight', () => {
	it('pide que lo guardado no se borre solo, una sola vez', async () => {
		const persist = vi.fn().mockResolvedValue(true);
		vi.stubGlobal('navigator', {
			storage: { persist, estimate: async () => ({ quota: 1e9, usage: 0 }) }
		});
		const roomIsTight = await freshRoomIsTight();

		await roomIsTight(fake('image/png'));
		await roomIsTight(fake('image/png'));

		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('avisa cuando lo que queda no alcanza para el doble del archivo', async () => {
		vi.stubGlobal('navigator', {
			storage: { estimate: async () => ({ quota: 1000, usage: 900 }) }
		});
		const roomIsTight = await freshRoomIsTight();

		expect(await roomIsTight(fake('image/png', 200))).toBe(true);
	});

	it('no avisa cuando sobra lugar', async () => {
		vi.stubGlobal('navigator', {
			storage: { estimate: async () => ({ quota: 1e9, usage: 0 }) }
		});
		const roomIsTight = await freshRoomIsTight();

		expect(await roomIsTight(fake('image/png', 200))).toBe(false);
	});

	// Un navegador que no sabe contestar no es un navegador sin lugar: la
	// estimación es orientación, y sin ella se intenta igual.
	it('sin estimación no dice nada', async () => {
		vi.stubGlobal('navigator', {});
		expect(await (await freshRoomIsTight())(fake('image/png', 200))).toBe(false);

		vi.stubGlobal('navigator', { storage: { estimate: async () => ({}) } });
		expect(await (await freshRoomIsTight())(fake('image/png', 200))).toBe(false);
	});

	// LO IMPORTANTE. Las dos pueden fallar de verdad —origen opaco, modo privado—
	// y no sólo faltar. Un rechazo que salga por arriba se lleva puesta la
	// inserción entera: la captura desaparece sin renglón y sin aviso.
	it('un rechazo del aparato NO cancela nada: contesta que no y sigue', async () => {
		vi.stubGlobal('navigator', {
			storage: {
				persist: async () => {
					throw new TypeError('no se puede en este origen');
				},
				estimate: async () => {
					throw new TypeError('no se puede en este origen');
				}
			}
		});
		const roomIsTight = await freshRoomIsTight();

		await expect(roomIsTight(fake('image/png', 200))).resolves.toBe(false);
	});

	it('y tampoco cancela si la estimación explota en la segunda captura', async () => {
		vi.stubGlobal('navigator', {
			storage: {
				persist: async () => true,
				estimate: async () => {
					throw new Error('SecurityError');
				}
			}
		});
		const roomIsTight = await freshRoomIsTight();

		await expect(roomIsTight(fake('image/png', 200))).resolves.toBe(false);
		await expect(roomIsTight(fake('image/png', 200))).resolves.toBe(false);
	});
});
