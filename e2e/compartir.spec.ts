import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Compartir una nota (spec 038, parte A). Lo que se prueba acá es lo que se ve:
// que el aviso sobre la privacidad esté ANTES de compartir y con esas palabras,
// y que sin cuenta la app lo diga en vez de hacer algo a medias. Lo que pasa
// después —el segundo caño, la mudanza— vive en las pruebas de unidad, y el
// recorrido completo entre dos aparatos es un gate manual.

test('el aviso de que la nota sale de la bóveda está antes de compartir', async ({ page }) => {
	await openApp(page);

	await page.getByRole('button', { name: /^Compartir nota/ }).first().click();

	await expect(page.getByRole('heading', { name: 'Compartir nota' })).toBeVisible();
	await expect(
		page.getByText(/sale de la bóveda y deja de estar cifrada/i)
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Compartir esta nota' })).toBeVisible();
});

test('sin cuenta lo dice, en vez de compartir a medias', async ({ page }) => {
	await openApp(page);

	await page.getByRole('button', { name: /^Compartir nota/ }).first().click();
	await page.getByRole('button', { name: 'Compartir esta nota' }).click();

	await expect(page.getByText(/tenés que entrar a tu cuenta/i)).toBeVisible();
	// Y la nota sigue sin compartir: el botón es el mismo, no cambió a "Dejar de
	// compartir".
	await expect(page.getByRole('button', { name: 'Compartir esta nota' })).toBeVisible();
});
