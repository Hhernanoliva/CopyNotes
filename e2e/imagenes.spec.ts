import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Las capturas dentro de una nota (spec 041). El bloque se siembra escribiendo
// directo en IndexedDB —igual que agent-visibility.spec.ts lee de ahí— porque
// las puertas que lo crean (pegar, soltar, "/imagen") no se pueden accionar de
// verdad desde Playwright: un pegado con imagen no es un evento sintético.
// Lo que se prueba acá es lo que ve una persona: que la captura aparezca, que
// no se agrande, que la descripción se guarde, y que ni Enter ni Backspace se
// lleven puestos los bytes.

// El id de una imagen es la huella SHA-256 de sus bytes: 64 caracteres hex en
// minúscula, nunca otra cosa. Acá alcanza con que TENGA esa forma.
function fakeImageId(width) {
	return width.toString(16).padStart(64, '0');
}

async function seedImage(page, blockId, width, height) {
	await page.evaluate(
		async ({ id, w, h, imageId }) => {
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
						imageId,
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
						row.imageId = imageId;
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
		{ id: blockId, w: width, h: height, imageId: fakeImageId(width) }
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

test('la manija selecciona la captura y Delete actúa sobre esa imagen', async ({ page }) => {
	await newNote(page);
	const row = page.locator('main [data-block-id]').first();
	const blockId = await row.getAttribute('data-block-id');
	await seedImage(page, blockId, 400, 200);

	const imageRow = page.locator('main [data-block-id]').first();
	await imageRow.hover();
	const grip = imageRow.getByRole('button', { name: 'Seleccionar o arrastrar renglón' });
	await grip.click();
	await expect(grip).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('1 renglón seleccionado')).toBeAttached();
	await expect(page.getByRole('textbox', { name: 'Descripción de la imagen' })).toBeFocused();

	await page.keyboard.press('Delete');
	await expect(page.locator('main img')).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('main img')).toBeVisible();
});

test('volver a la descripción suelta la selección antes de editar', async ({ page }) => {
	await newNote(page);
	const row = page.locator('main [data-block-id]').first();
	const blockId = await row.getAttribute('data-block-id');
	await seedImage(page, blockId, 400, 200);

	const imageRow = page.locator('main [data-block-id]').first();
	await imageRow.hover();
	const grip = imageRow.getByRole('button', { name: 'Seleccionar o arrastrar renglón' });
	const caption = page.getByRole('textbox', { name: 'Descripción de la imagen' });
	await grip.click();
	await expect(grip).toHaveAttribute('aria-pressed', 'true');

	await caption.click();
	await expect(grip).toHaveAttribute('aria-pressed', 'false');
	await caption.pressSequentially('detalle');
	await page.keyboard.press('Delete');
	await expect(page.locator('main img')).toBeVisible();
	await expect(caption).toHaveValue('detalle');
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

// Mantener Backspace apretado NO es apretarlo muchas veces: el navegador manda
// el mismo `keydown` una y otra vez con `event.repeat === true`. Playwright no
// tiene auto-repetición, así que las teclas de esta prueba salen por CDP
// (`Input.dispatchKeyEvent` con `autoRepeat`), que es el mismo evento de
// confianza que manda el teclado de verdad: borra el texto Y trae el `repeat`.
async function holdBackspace(page, times) {
	const cdp = await page.context().newCDPSession(page);
	for (let index = 0; index < times; index += 1) {
		await cdp.send('Input.dispatchKeyEvent', {
			type: 'keyDown',
			key: 'Backspace',
			code: 'Backspace',
			windowsVirtualKeyCode: 8,
			nativeVirtualKeyCode: 8,
			autoRepeat: index > 0
		});
	}
	await cdp.send('Input.dispatchKeyEvent', {
		type: 'keyUp',
		key: 'Backspace',
		code: 'Backspace',
		windowsVirtualKeyCode: 8,
		nativeVirtualKeyCode: 8
	});
	await cdp.detach();
}

// "No se borró" no se puede afirmar en el mismo instante de la tecla:
// `handleDeleteBlock` es asíncrono y cualquier assertion inmediata contesta
// antes de que el borrado llegue — con el bug puesto la prueba salía verde
// (medido). Se le da tiempo de llegar y recién ahí se mira.
async function sigueAhi(page, caption) {
	await page.waitForTimeout(300);
	await expect(caption).toBeVisible();
	await expect(page.locator('main img')).toBeVisible();
}

test('borrar la descripción manteniendo Backspace no se lleva la captura', async ({ page }) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedImage(page, blockId, 400, 200);

	const caption = page.getByRole('textbox', { name: 'Descripción de la imagen' });
	// Un segundo renglón primero: la app no borra el último bloque de una nota, y
	// sin él esta prueba pasaría aunque el borrado se disparara — que es
	// exactamente lo que hay que poder ver fallar.
	await caption.click();
	await page.keyboard.press('Enter');
	await expect(page.locator('main [data-block-id]')).toHaveCount(2);

	await caption.click();
	await caption.fill('hola');
	await caption.click();
	await page.keyboard.press('End');

	// Cuatro repeticiones para vaciar "hola" y tres de sobra sobre el campo ya
	// vacío: sin el guardia de `repeat`, la segunda de sobra borraba el bloque.
	await holdBackspace(page, 7);
	await expect(caption).toHaveValue('');
	await sigueAhi(page, caption);

	// Segundo síntoma, mismo camino: el primer paso no queda guardado. Un
	// Backspace sobre el campo vacío arma el borrado; escribir lo desarma; volver
	// a vaciar el campo NO deja el borrado listo para el Backspace siguiente.
	await caption.press('Backspace');
	await caption.pressSequentially('ab');
	await caption.press('Backspace');
	await caption.press('Backspace');
	await expect(caption).toHaveValue('');

	await caption.press('Backspace');
	await sigueAhi(page, caption);
});

test('sin los bytes queda un hueco del tamaño de la captura, no una franja', async ({ page }) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	// El bloque apunta a unos bytes que no están: en la parte A pasa importando un
	// paquete incompleto. El hueco tiene que medir lo que medía la captura, no
	// estirarse a la columna entera.
	await page.evaluate(
		({ id, imageId }) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const tx = open.result.transaction('blocks', 'readwrite');
					const blocks = tx.objectStore('blocks');
					const get = blocks.get(id);
					get.onsuccess = () => {
						const row = get.result;
						row.type = 'image';
						row.content = '';
						row.html = '';
						row.imageId = imageId;
						row.imageType = 'image/png';
						row.imageBytes = 1234;
						row.imageWidth = 240;
						row.imageHeight = 160;
						blocks.put(row);
					};
					tx.oncomplete = () => resolve(null);
					tx.onerror = () => reject(tx.error);
				};
			}),
		{ id: blockId, imageId: fakeImageId(240) }
	);
	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();

	const hueco = page.getByText('Imagen no disponible');
	await expect(hueco).toBeVisible();
	const box = await hueco.boundingBox();
	expect(Math.round(box.width)).toBe(240);
	expect(Math.round(box.height)).toBe(160);
});

test('la lupa toma el foco al abrirse y lo devuelve al cerrarse', async ({ page }) => {
	await newNote(page);
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedImage(page, blockId, 400, 200);

	const zoom = page.getByRole('button', { name: /Ver la captura a tamaño real/ });
	await zoom.focus();
	await page.keyboard.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Captura ampliada' });
	await expect(dialog).toBeVisible();
	expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('dialog');

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('1 renglón seleccionado')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByText('1 renglón seleccionado')).toBeAttached();
	expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
		'Ver la captura a tamaño real'
	);
});
