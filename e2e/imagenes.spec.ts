import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Las capturas dentro de una nota (spec 041). El bloque se siembra escribiendo
// directo en IndexedDB —igual que agent-visibility.spec.ts lee de ahí— porque
// las puertas que lo crean (pegar, soltar, "/imagen") no se pueden accionar de
// verdad desde Playwright: un pegado con imagen no es un evento sintético.
// Lo que se prueba acá es lo que ve una persona: que la captura aparezca, que
// no se agrande, que la descripción se guarde, y que ni Enter ni Backspace se
// lleven puestos los bytes.

async function seedImage(page, blockId, width, height) {
	await page.evaluate(
		async ({ id, w, h }) => {
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#1e3a5f';
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#ffffff';
			ctx.font = `${Math.round(h / 8)}px sans-serif`;
			ctx.fillText(`${w}x${h}`, 20, h / 2);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
			await new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction(['imageBodies', 'blocks'], 'readwrite');
					tx.objectStore('imageBodies').put({
						imageId: `img-${w}`,
						blob,
						type: 'image/png',
						bytes: blob.size,
						width: w,
						height: h,
						createdAt: new Date().toISOString(),
						uploadedFor: null
					});
					const blocks = tx.objectStore('blocks');
					const get = blocks.get(id);
					get.onsuccess = () => {
						const row = get.result;
						row.type = 'image';
						row.content = '';
						row.html = '';
						row.imageId = `img-${w}`;
						row.imageType = 'image/png';
						row.imageBytes = blob.size;
						row.imageWidth = w;
						row.imageHeight = h;
						blocks.put(row);
					};
					tx.oncomplete = () => resolve(null);
					tx.onerror = () => reject(tx.error);
				};
			});
		},
		{ id: blockId, w: width, h: height }
	);
	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
}

test('la captura se ve, se describe y se abre a tamaño real', async ({ page }) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedImage(page, blockId, 900, 420);

	const img = page.locator('main img');
	await expect(img).toBeVisible();
	await img.evaluate((el) => el.decode());

	const caption = page.getByRole('textbox', { name: 'Descripción de la imagen' });
	await caption.fill('pantallazo del error');
	await page.waitForTimeout(900);
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Descripción de la imagen' })).toHaveValue(
		'pantallazo del error'
	);
	await expect(page.locator('main img')).toHaveAttribute('alt', 'pantallazo del error');

	await page.getByRole('button', { name: /Ver a tamaño real/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Captura ampliada' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

test('una captura chica no se agranda, y sin descripción no aparece el +', async ({ page }) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedImage(page, blockId, 200, 120);

	const img = page.locator('main img');
	await expect(img).toBeVisible();
	const box = await img.boundingBox();
	expect(Math.round(box.width)).toBe(200);
	expect(Math.round(box.height)).toBe(120);

	await page.getByRole('textbox', { name: 'Descripción de la imagen' }).click();
	await expect(page.getByRole('button', { name: 'Agregar bloque' })).toHaveCount(0);
});

test('Enter da un renglón nuevo sin convertir la imagen; dos Backspace la borran', async ({
	page
}) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedImage(page, blockId, 400, 200);

	const caption = page.getByRole('textbox', { name: 'Descripción de la imagen' });
	await caption.click();
	await page.keyboard.press('Enter');
	await expect(page.locator('main [data-block-id]')).toHaveCount(2);
	await expect(page.locator('main img')).toBeVisible();

	await caption.click();
	await page.keyboard.press('Backspace');
	await expect(page.locator('main img')).toBeVisible();
	await page.keyboard.press('Backspace');
	await expect(page.locator('main img')).toHaveCount(0);
	await expect(page.locator('main [data-block-id]')).toHaveCount(1);
});
