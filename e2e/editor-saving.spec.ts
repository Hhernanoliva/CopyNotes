import { test, expect } from '@playwright/test';

// La puerta única de escritura del editor.
//
// El editor guarda con medio segundo de retraso para no escribir en cada tecla,
// y ese guardado lleva adentro una COPIA del texto del momento en que se armó.
// Cualquier escritura que salga por otro lado y no cancele ese timer se pisa
// sola medio segundo después, con datos viejos. Estas pruebas son el candado.

async function readBlock(page, id) {
	return page.evaluate(
		(blockId) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(new Error('no abrió la base'));
				open.onsuccess = () => {
					const read = open.result
						.transaction('blocks', 'readonly')
						.objectStore('blocks')
						.get(blockId);
					read.onsuccess = () =>
						resolve({ type: read.result?.type, content: read.result?.content });
					read.onerror = () => reject(new Error('no se pudo leer'));
				};
			}),
		id
	);
}

// Un renglón nuevo y vacío al final del primero, para no pelear con la nota de
// ejemplo. Devuelve su id, que es el que las pruebas después miran en la base.
async function newRow(page) {
	await page.goto('/');
	const first = page.locator('main [data-block-id]').first();
	await first.locator('.block-editable').waitFor();
	const rows = page.locator('main [data-block-id]');
	const before = await rows.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-block-id'))
	);
	await first.locator('.block-editable').click();
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await expect(rows).toHaveCount(before.length + 1);
	const after = await rows.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-block-id'))
	);
	return after.find((id) => !before.includes(id));
}

test('escribir "- " y parar ahí deja una viñeta, no vuelve a "-"', async ({ page }) => {
	// El guion arma el guardado con retraso llevando "-" adentro. El espacio
	// convierte el renglón en viñeta y vacía el texto. Si esa conversión no
	// cancela el timer, medio segundo después vuelve "-" — y como el usuario ya
	// dejó de escribir, nada lo tapa.
	const id = await newRow(page);
	await page.keyboard.type('-');
	await page.keyboard.type(' ');
	// Y se para acá a propósito: seguir tecleando reprogramaría el guardado y
	// escondería el bug.
	expect(await readBlock(page, id)).toEqual({ type: 'bullet', content: '' });

	await page.waitForTimeout(1200);

	expect(await readBlock(page, id)).toEqual({ type: 'bullet', content: '' });
	await page.reload();
	await page.locator('main [data-block-id]').first().waitFor();
	expect(await readBlock(page, id)).toEqual({ type: 'bullet', content: '' });
});

test('un cambio de estructura no se lleva puesto lo que se estaba escribiendo', async ({
	page
}) => {
	// La otra mitad de la misma puerta: las escrituras de un renglón se funden en
	// vez de reemplazarse. Escribir arma un guardado con el texto; contraer el
	// renglón escribe otro campo del MISMO renglón. Si el segundo reemplazara al
	// primero en vez de sumarse, el texto recién tecleado no llegaría nunca.
	const id = await newRow(page);
	await page.keyboard.type('comprar pan');
	// Sin pausa: el guardado del texto sigue armado en este instante.
	await page.keyboard.press('Tab');

	await page.waitForTimeout(1200);
	await page.reload();
	await page.locator('main [data-block-id]').first().waitFor();

	expect((await readBlock(page, id)).content).toBe('comprar pan');
});
