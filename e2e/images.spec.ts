import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Las puertas por donde entra una captura (spec 041).
//
// El `Ctrl+V` de Playwright NO dispara un pegado del sistema, y soltar un archivo
// desde el escritorio tampoco se puede sintetizar. Lo que sí se puede es armar el
// evento con un `File` de verdad adentro y mandárselo al renglón: eso ejercita
// todo lo nuestro —el filtro, el ingestor, la escritura en el aparato, el dibujo
// y el foco— y deja afuera sólo una cosa, que el sistema operativo entregue el
// archivo. Esa parte la mira una persona en el gate a mano.

// Un PNG de 1×1 de verdad: tiene que pasar por `detectImageType` (la firma) y por
// `createImageBitmap` (las medidas), así que no sirve un archivo inventado.
const PNG_1x1 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function dropOnFocusedRow(page, { type, base64, name }) {
	await page.evaluate(
		({ type, base64, name }) => {
			const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
			const file = new File([bytes], name, { type });
			const transfer = new DataTransfer();
			transfer.items.add(file);
			const row = document.activeElement.closest('[data-block-id]');
			row.dispatchEvent(
				new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true })
			);
			row.dispatchEvent(
				new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
			);
		},
		{ type, base64, name }
	);
}

test('pegar una captura la pone en la nota y deja el cursor en la descripción', async ({ page }) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();

	await page.evaluate((base64) => {
		const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
		const file = new File([bytes], 'image.png', { type: 'image/png' });
		const transfer = new DataTransfer();
		transfer.items.add(file);
		document.activeElement.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
		);
	}, PNG_1x1);

	// La captura entró y el renglón vacío donde cayó se fue con ella.
	await expect(page.locator('main img')).toBeVisible();
	const caption = page.getByRole('textbox', { name: 'Descripción de la imagen' });
	await expect(caption).toBeVisible();

	// LA PRUEBA DEL FOCO: se escribe sin tocar nada ni hacer un solo clic. Si el
	// cursor no hubiera aterrizado en la descripción, esto se perdería en el aire.
	await page.keyboard.type('mi captura');
	await expect(caption).toHaveValue('mi captura');
});

test('soltar un archivo que no es imagen avisa, y no se lleva a nadie fuera de la app', async ({
	page
}) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('sigo acá');

	await dropOnFocusedRow(page, {
		type: 'application/pdf',
		base64: 'JVBERi0xLjQK',
		name: 'contrato.pdf'
	});

	await expect(page.getByText('Ese archivo no es una imagen que CopyNotes pueda guardar.')).toBeVisible();
	await expect(page.locator('main img')).toHaveCount(0);
	// Seguimos en la nota, con el renglón intacto: el evento se frenó.
	await expect(first).toHaveText('sigo acá');
});

test('soltar una captura encima de un renglón la pone ahí', async ({ page }) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();

	await dropOnFocusedRow(page, { type: 'image/png', base64: PNG_1x1, name: 'captura.png' });

	await expect(page.locator('main img')).toBeVisible();
});
