// El selector de archivos, y la carrera que se comía el respaldo.
//
// Reportado por Hernán el 2026-08-16: en la web (sitio publicado, localhost y el
// iPhone, los tres igual) elegía el JSON y **no pasaba nada** — ni resumen ni error.
// En la app de escritorio y en los e2e funcionaba, y por eso ningún test lo vio:
// Playwright pone el archivo con `setFiles`, sin diálogo nativo, así que la ventana
// nunca pierde ni recupera el foco y el camino que falla no se ejecuta.
//
// Lo que pasa en un navegador de verdad: el diálogo del Finder se cierra, la ventana
// recupera el foco, y ESE aviso arrancaba un reloj de 100 ms para decidir "canceló".
// Si el `change` con el archivo llegaba un poco más tarde, la promesa ya se había
// resuelto como cancelada — y cancelar es no hacer nada, en silencio.
//
// Corre bajo jsdom: necesita `document` y eventos.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openImageFiles, openTextFile } from './files';

function fileInput() {
	return document.querySelector('input[type="file"]');
}

function pick(input, name = 'respaldo.json', content = '{"format":"copynotes.backup"}') {
	const file = new File([content], name, { type: 'application/json' });
	// `input.files` es de sólo lectura y no hay `DataTransfer` en jsdom.
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	input.dispatchEvent(new Event('change'));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	vi.useRealTimers();
});

describe('elegir un archivo', () => {
	it('el archivo llega y se devuelve', async () => {
		const promise = openTextFile({ accept: '.json' });
		pick(fileInput());

		expect(await promise).toMatchObject({ status: 'opened', fileName: 'respaldo.json' });
	});

	// LA PRUEBA DEL BUG. El foco vuelve antes que el archivo, que es el orden normal
	// cuando se cierra un diálogo nativo.
	it('un archivo que llega DESPUÉS de que la ventana recupera el foco no se pierde', async () => {
		const promise = openTextFile({ accept: '.json' });
		const input = fileInput();

		window.dispatchEvent(new Event('focus'));
		await wait(250);
		pick(input);

		expect(await promise).toMatchObject({ status: 'opened', fileName: 'respaldo.json' });
	});

	it('y cerrar el diálogo sin elegir nada sigue siendo cancelar', async () => {
		const promise = openTextFile({ accept: '.json' });
		fileInput().dispatchEvent(new Event('cancel'));

		expect(await promise).toEqual({ status: 'cancelled' });
	});
});

// El iPhone, reportado el 2026-08-16 con el arreglo de arriba YA puesto: elegía el
// archivo y seguía sin pasar nada. Misma forma de fallar, causa más lenta — iOS tiene
// que COPIAR el archivo desde Archivos/iCloud antes de entregarlo, y eso puede tardar
// segundos. Agrandar la espera es correr la misma adivinanza más lejos.
//
// La regla que queda: el foco NO decide nada. Cancelar lo dice el navegador con su
// evento `cancel`; el reloj es sólo una red para que la promesa no quede colgada para
// siempre, y es larguísimo a propósito.
describe('un archivo que tarda en llegar', () => {
	it('sigue llegando aunque pasen segundos desde que la ventana recuperó el foco', async () => {
		vi.useFakeTimers();
		const promise = openTextFile({ accept: '.json' });
		const input = fileInput();

		window.dispatchEvent(new Event('focus'));
		// Mucho más que cualquier espera razonable: iOS copiando un archivo de iCloud.
		await vi.advanceTimersByTimeAsync(20_000);
		pick(input);

		vi.useRealTimers();
		expect(await promise).toMatchObject({ status: 'opened', fileName: 'respaldo.json' });
	});
});

// La puerta binaria (spec 041): el mismo diálogo, sin leer el archivo a texto.
// El tope NO va acá — lo pone `images/ingest.ts`, que sabe cuál es el de una
// imagen. Y cancelar sigue siendo lo que dice el navegador y nadie más.
describe('elegir una imagen', () => {
	it('devuelve el archivo tal cual, sin leerlo', async () => {
		const promise = openImageFiles();
		const input = fileInput();
		expect(input.getAttribute('accept')).toBe('image/*');
		pick(input, 'captura.png', 'no-importa');

		const result = await promise;
		expect(result.status).toBe('opened');
		expect(result.files.map((file) => file.name)).toEqual(['captura.png']);
	});

	it('cerrar el diálogo sin elegir nada no inserta nada', async () => {
		const promise = openImageFiles();
		fileInput().dispatchEvent(new Event('cancel'));

		expect(await promise).toEqual({ status: 'cancelled' });
	});

	// Una captura de 8 MB tiene que LLEGAR: el "pesa demasiado" se lo dice el
	// ingestor con su propio mensaje, no este diálogo con silencio.
	it('no le pone tope al peso: eso lo decide el ingestor', async () => {
		const promise = openImageFiles();
		pick(fileInput(), 'gigante.png', 'x'.repeat(2000));

		expect(await promise).toMatchObject({ status: 'opened' });
	});
});
