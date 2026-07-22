import { test, expect } from '@playwright/test';

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

test('deshacer revierte solo el código en línea (guard cross-engine)', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
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
