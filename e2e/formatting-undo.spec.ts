import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Prueba enfocada del guard doble de la puerta de formato, pensada para correr
// también en WebKit. Es el motor donde el evento `input` incidental de
// execCommand llega tarde (o nunca), así que valida la mitad del guard que se
// apoya en la igualdad de contenido —no solo la bandera síncrona que alcanza en
// Chromium—. Se mantiene separada de e2e/formatting.spec.ts para no arrastrar al
// proyecto webkit las pruebas de portapapeles/PWA que no le aplican.

const title = (page) => page.getByLabel('Título de la nota');

async function selectAllInBlock(page, editable) {
	await editable.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	});
}

async function linkWholeBlock(page, editable) {
	await editable.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, editable);
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter');
}

test('deshacer revierte solo el código en línea (guard cross-engine)', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: guard código');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('codigo', { delay: 25 });
	// Cortar la ráfaga de tipeo para que el paso del texto y el del formato sean
	// distintos: el primer Deshacer solo puede quitar el formato.
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Código en línea' }).click();
	await expect(first.locator('code')).toHaveText('codigo');

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('code')).toHaveCount(0);
	await expect(first).toHaveText('codigo');
});

// Los atajos de la spec 033, en WebKit — el motor de Safari y el que usa la app
// de escritorio en macOS. Chromium ya los cubre en formatting.spec.ts; acá se
// verifica que la tecla llegue a la página en el otro motor, donde el sistema o
// el navegador podrían quedarse con la combinación antes que la app.
test('Ctrl/Cmd+Alt+1 y Ctrl/Cmd+Alt+F llegan a la app (guard cross-engine)', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: atajos webkit');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo por atajo', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);

	await page.keyboard.press('ControlOrMeta+Alt+Digit1');
	await expect(first).toHaveClass(/block-editable--h1/);

	// Y la entrada a la barra, que no debe abrir el buscador general.
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.keyboard.press('ControlOrMeta+Alt+KeyF');
	await expect(page.getByRole('button', { name: 'Título 1' })).toBeFocused();
	// El buscador general vive siempre en el DOM: lo que importa es que esta
	// tecla no lo ABRA (Ctrl/Cmd+F sin Alt sí es buscar).
	await expect(page.locator('dialog[aria-label="Buscar"]')).toBeHidden();
});

test('el clic editable muestra acciones y Ctrl/Cmd+K enfoca Abrir (guard cross-engine)', async ({
	page
}) => {
	await newNote(page);
	const first = page.locator('main [role="textbox"]').first();
	await linkWholeBlock(page, first);

	await first.locator('a').click();
	await expect(page.getByRole('dialog', { name: 'Acciones del enlace' })).toBeVisible();
	await expect(first).toBeFocused();
	await page.keyboard.press('Escape');

	await first.evaluate((el) => {
		const anchor = el.querySelector('a');
		el.focus();
		const range = document.createRange();
		range.setStart(anchor.firstChild, 2);
		range.collapse(true);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	});
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.getByRole('button', { name: 'Abrir' })).toBeFocused();
});
