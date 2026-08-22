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

test('el renglón-título se edita arriba y lo escrito sobrevive al salir', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	const titulo = page.locator('[data-zoom-title] .block-editable');
	await expect(titulo).toHaveText('Padre');
	await titulo.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' remodelado');
	await page.waitForTimeout(700); // el guardado del tipeo va con retraso

	await page.getByRole('navigation', { name: 'Dónde estás' }).getByRole('button').first().click();
	await expect
		.poll(() => blockTexts(page))
		.toEqual(['Padre remodelado', 'Hijo 1', 'Hijo 2', 'Suelto']);
});

test('Enter en el renglón-título baja al primer hijo en vez de partirlo', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	const titulo = page.locator('[data-zoom-title] .block-editable');
	await titulo.click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(200);
	// Partirlo crearía un hermano de la raíz: un renglón fuera de la vista.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await expect(titulo).toHaveText('Padre');
	await page.keyboard.type('!');
	await expect.poll(() => blockTexts(page)).toEqual(['!Hijo 1', 'Hijo 2']);
});

test('entrar en un renglón sin hijos crea el primero y deja el cursor ahí', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Suelto');

	await expect(page.locator('[data-zoom-title] .block-editable')).toHaveText('Suelto');
	await page.keyboard.type('Primero');
	await expect.poll(() => blockTexts(page)).toEqual(['Primero']);
});

test('en escritorio se entra con el ícono del renglón', async ({ page }) => {
	await notaConRama(page);

	const row = page.locator(LIST_ROW, { hasText: 'Padre' }).first();
	await row.hover();
	await row.getByRole('button', { name: 'Entrar en el renglón' }).click();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	// El renglón-título no lo lleva: no está en una lista.
	await expect(
		page.locator('[data-zoom-title]').getByRole('button', { name: 'Entrar en el renglón' })
	).toHaveCount(0);
});

test('el separador no tiene por dónde entrar', async ({ page }) => {
	await newNote(page);
	const first = page.locator(`${LIST_ROW} .block-editable`).first();
	await first.click();
	await page.keyboard.type('/separador');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(300);

	const separador = page.locator(LIST_ROW).first();
	await separador.hover();
	await expect(separador.getByRole('button', { name: 'Entrar en el renglón' })).toHaveCount(0);
});

test('Alt+→ entra en el renglón del cursor y Alt+← sale un nivel', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Padre', { exact: true }).click();
	await page.keyboard.press('Alt+ArrowRight');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	await page.keyboard.press('Alt+ArrowLeft');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
});

test('con dos renglones seleccionados, Alt+←/→ se consumen y no hacen nada', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Hijo 1', { exact: true }).click();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Alt+ArrowRight');
	await page.waitForTimeout(200);
	// Sin la rama explícita, la tecla cae al renglón enfocado y entra en UNO en
	// silencio — así fue como Tab indentaba sólo el primero de varios (AGENT.md).
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toHaveCount(0);
});

test('arrastrar al margen izquierdo cuelga de la raíz de la vista, no de la nota', async ({
	page
}) => {
	await notaConRama(page);

	// Anidar Hijo 2 debajo de Hijo 1 para tener algo que sacar de nivel adentro.
	await page.getByText('Hijo 2', { exact: true }).click();
	await page.keyboard.press('Tab');
	await page.waitForTimeout(200);

	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	const origen = page.locator(LIST_ROW, { hasText: 'Hijo 2' }).first();
	const handle = origen.getByRole('button', { name: 'Seleccionar o arrastrar renglón' });
	const caja = await origen.boundingBox();
	await handle.hover();
	await page.mouse.down();
	await page.mouse.move(caja.x - 80, caja.y + caja.height / 2, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(300);

	// Sigue adentro y sigue viéndose: si colgara del primer nivel de la NOTA,
	// se iría de la pantalla.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	const fila = page.locator(LIST_ROW, { hasText: 'Hijo 2' }).first();
	await expect(fila).toHaveCSS('padding-left', '0px');
});

test('recargar estando adentro sigue adentro', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await page.waitForTimeout(400); // la preferencia se escribe fuera del clic

	await page.reload();
	await expect(page.locator(LIST_ROW).first()).toBeVisible();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toBeVisible();
});

test('buscar y saltar a un renglón de otra rama muestra la nota entera', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.getByLabel('Texto a buscar').fill('Suelto');
	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /Suelto/ }).click();
	await page.waitForTimeout(400);

	// El renglón buscado vive en otra rama: la nota entera es la única vista que
	// lo muestra.
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toHaveCount(0);
});
