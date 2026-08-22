import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Spec 043: entrar en un renglón lo abre como si fuera la nota entera.
//
// El renglón-título también lleva `data-block-id`, pero NO está en la lista: se
// lo excluye acá para que "lo que se ve en la lista" signifique siempre lo mismo.
const LIST_ROW = 'main [data-block-id]:not([data-zoom-title])';

const blockTexts = (page) =>
	page.$$eval(`${LIST_ROW} .block-editable`, (els) => els.map((el) => el.textContent ?? ''));

// Arma: Padre > [Hijo 1, Hijo 2], y un Suelto al final de la nota.
async function notaConRama(page) {
	await newNote(page);
	const first = page.locator(`${LIST_ROW} .block-editable`).first();
	await first.click();
	await page.keyboard.type('Padre');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 1');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(150);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 2');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.press('Shift+Tab');
	await page.waitForTimeout(150);
	await page.keyboard.type('Suelto');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
}

async function entrarDesdeElMenu(page, texto) {
	const row = page.locator(LIST_ROW, { hasText: texto }).first();
	await row.hover();
	await row.getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Entrar acá' }).click();
	await page.waitForTimeout(150);
}

test('entrar por el menú deja sólo la rama, y la miga devuelve la nota entera', async ({ page }) => {
	await notaConRama(page);

	await entrarDesdeElMenu(page, 'Padre');
	// Adentro se ven EXACTAMENTE los descendientes: ni el propio Padre en la
	// lista, ni el Suelto que vive en otra rama.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	const migas = page.getByRole('navigation', { name: 'Dónde estás' });
	await expect(migas).toBeVisible();

	await migas.getByRole('button').first().click();
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(migas).toBeHidden();
});

test('Shift+Tab en el primer nivel de la vista no saca el renglón de la vista', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	await page.getByText('Hijo 1', { exact: true }).click();
	await page.keyboard.press('Shift+Tab');
	await page.waitForTimeout(200);
	// Sigue adentro y sigue estando: sin la regla, se iba al primer nivel de la
	// nota y desaparecía de la pantalla.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
});

test('entrar con el menú "/" abierto lo cierra y no deja nada flotando', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Suelto', { exact: true }).click();
	await page.keyboard.press('End');
	await page.keyboard.type('/');
	await expect(page.locator('#slash-menu')).toBeVisible();

	await entrarDesdeElMenu(page, 'Padre');
	await expect(page.locator('#slash-menu')).toBeHidden();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
});
