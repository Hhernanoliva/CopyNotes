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

import { describe, expect, it } from 'vitest';
import { openTextFile } from './files';

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
