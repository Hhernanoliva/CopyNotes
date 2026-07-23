import { test, expect } from '@playwright/test';

// Inline formatting flows (task 16): toolbar visibility, bold persistence,
// heading conversion persistence, and a copy-button regression guard. Each
// test starts a fresh note via "Nueva nota" so the block list is predictable
// (a single empty text block) rather than depending on the seeded demo note.

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

test('selecting text shows the formatting toolbar', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: toolbar');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('seleccioname', { delay: 25 });
	await selectAllInBlock(page, first);

	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
});

test('the toolbar waits a beat before appearing on a fresh selection', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: retardo');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('seleccioname', { delay: 25 });

	const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
	const start = Date.now();
	await selectAllInBlock(page, first);
	await expect(toolbar).toBeVisible();
	const elapsed = Date.now() - start;
	// It must still appear (above), but not instantly — a short delay keeps it
	// from flashing while the user is still dragging out a selection.
	expect(elapsed).toBeGreaterThan(200);
});

test('applying bold wraps the text in <strong> and survives a reload', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: negrita');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('hola mundo', { delay: 25 });
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('hola mundo');
	await page.waitForTimeout(700); // let autosave flush

	await page.reload();
	await expect(title(page)).toHaveValue('Formato E2E: negrita');
	await expect(page.locator('main [role="textbox"] strong').first()).toHaveText('hola mundo');
});

test('converting to H2 changes the block and survives a reload without adding an empty block', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: encabezado');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo de seccion', { delay: 25 });
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	const blocksBefore = await page.locator('main [role="textbox"]').count();

	await page.getByRole('button', { name: 'Título 2' }).click();
	await expect(first).toHaveClass(/block-editable--h2/);
	await expect(first).toHaveText('Titulo de seccion');

	const blocksAfter = await page.locator('main [role="textbox"]').count();
	expect(blocksAfter).toBe(blocksBefore);

	await page.waitForTimeout(700); // let autosave flush
	await page.reload();

	await expect(title(page)).toHaveValue('Formato E2E: encabezado');
	const restored = page.locator('main [role="textbox"]').first();
	await expect(restored).toHaveClass(/block-editable--h2/);
	await expect(restored).toHaveText('Titulo de seccion');
	await expect(page.locator('main [role="textbox"]')).toHaveCount(blocksBefore);
});

test('a Shift+Enter soft line break survives reload and copies as a real newline', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: salto suave');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('uno', { delay: 25 });
	await page.keyboard.press('Shift+Enter');
	await page.keyboard.type('dos', { delay: 25 });
	// The break may live in the DOM as \n or <br>; what matters is the text.
	await expect.poll(() => first.evaluate((el) => el.innerText.trim())).toBe('uno\ndos');
	await page.waitForTimeout(700); // let autosave flush

	await page.reload();
	await expect(title(page)).toHaveValue('Formato E2E: salto suave');
	const restored = page.locator('main [role="textbox"]').first();
	await expect.poll(() => restored.evaluate((el) => el.innerText.trim())).toBe('uno\ndos');

	const row = page.locator('main .group').first();
	await row.hover();
	await row.getByRole('button', { name: 'Copiar bloque' }).click();
	await expect
		.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
		.toBe('uno\ndos');
});

test('regression guard: the copy block button still works after formatting changes', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: copiar');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('texto con formato', { delay: 25 });
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('texto con formato');

	const row = page.locator('main .group').first();
	await row.hover();
	await row.getByRole('button', { name: 'Copiar bloque' }).click();
	await expect
		.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).length)
		.toBeGreaterThan(0);

	// Copying does not mutate the block's own text.
	await expect(first).toHaveText('texto con formato');
});

test('deshacer revierte solo el código en línea, sin borrar el texto', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer código');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('codigo', { delay: 25 });
	// Cortar la ráfaga de tipeo: el snapshot del texto y el del formato deben ser
	// pasos distintos, así el primer Deshacer solo puede quitar el formato.
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

test('deshacer revierte solo el color, sin borrar el texto', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer color');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('coloreado', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	// El color se aplica por CLASE (fmt-color-*), no por style inline.
	await page.getByRole('button', { name: 'Color de texto' }).click();
	await page.getByRole('menuitemradio', { name: 'Rojo' }).click();
	await expect(first.locator('.fmt-color-red')).toHaveCount(1);

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('.fmt-color-red')).toHaveCount(0);
	await expect(first).toHaveText('coloreado');
});

test('deshacer un H2 lo devuelve a texto normal', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer H2');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Seccion', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Título 2' }).click();
	await expect(first).toHaveClass(/block-editable--h2/);

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first).not.toHaveClass(/block-editable--h2/);
	await expect(first).toHaveText('Seccion');
});

test('deshacer quita el enlace recién puesto — sin volver a hacer clic en el texto', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer enlace');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter'); // Guardar
	await expect(first.locator('a')).toHaveText('sitio');

	// CLAVE: no volver a hacer clic en el texto; el foco debe haber vuelto al
	// renglón para que Ctrl/Cmd+Z llegue al editor (arreglo del foco del popover).
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('a')).toHaveCount(0);
	await expect(first).toHaveText('sitio');
});

test('deshacer restaura un enlace que se acababa de quitar', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: quitar y deshacer');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter');
	await expect(first.locator('a')).toHaveText('sitio');

	// Reabrir el popover con el cursor DENTRO del enlace (así la barra detecta el
	// href y muestra "Quitar") y quitarlo.
	await page.waitForTimeout(650);
	await first.locator('a').click();
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByRole('button', { name: 'Quitar', exact: true }).click();
	await expect(first.locator('a')).toHaveCount(0);

	// Un Deshacer devuelve el enlace.
	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('a')).toHaveText('sitio');
});

test('Escape en el editor de enlace cierra el popover y devuelve el foco al renglón (spec 020)', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: escape enlace');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await expect(page.getByLabel('URL del enlace')).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(page.getByLabel('URL del enlace')).toHaveCount(0);
	await expect(first).toBeFocused();
});

test('Escape cierra la barra de formato y devuelve el foco al renglón (spec 020)', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: escape barra');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toHaveCount(0);
	await expect(first).toBeFocused();
});

test('Ctrl/Cmd+clic abre el enlace en una pestaña nueva', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: abrir enlace');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter');
	await expect(first.locator('a')).toHaveText('sitio');

	// Ctrl/Cmd+clic sobre el enlace lo abre; un clic sin modificador solo edita.
	const [popup] = await Promise.all([
		page.waitForEvent('popup'),
		first.locator('a').click({ modifiers: ['ControlOrMeta'] })
	]);
	expect(popup.url()).toContain('ejemplo.com');
	await popup.close();
});

test('deshacer restaura el formato que se acababa de limpiar', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: quitar formato');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('texto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('texto');

	// Quitar formato vive dentro del menú "Más opciones".
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Más opciones' }).click();
	await page.getByRole('menuitem', { name: 'Quitar formato' }).click();
	await expect(first.locator('strong')).toHaveCount(0);

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('strong')).toHaveText('texto');
});

test('rehacer recupera el código en línea deshecho', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: rehacer código');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('codigo', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Código en línea' }).click();
	await expect(first.locator('code')).toHaveText('codigo');

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('code')).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(first.locator('code')).toHaveText('codigo');
});

test('aplicar negrita por atajo a mitad de ráfaga: 1er deshacer quita negrita, 2do quita texto', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: negrita atajo deshacer');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	// SIN pausa: el atajo cae dentro de la ráfaga de tipeo. Con el código viejo el
	// formato se agrupa con el texto y el primer Deshacer borra todo. La puerta le
	// da su propio paso. El 2do Deshacer (llega a vacío) descarta un paso duplicado.
	await page.keyboard.type('hola mundo', { delay: 25 });
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('hola mundo');

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('strong')).toHaveCount(0);
	await expect(first).toHaveText('hola mundo');

	await page.keyboard.press('ControlOrMeta+z');
	await expect(first).toHaveText('');
});

// Los cuatro atajos pasan por la misma puerta y cada uno crea su propio paso de
// Deshacer. El tachado (Ctrl/Cmd+Shift+S) valida el nombre canónico `strike`:
// antes emitía `strikethrough` y moría en la puerta.
for (const { nombre, keys, tag } of [
	{ nombre: 'negrita', keys: 'ControlOrMeta+b', tag: 'strong' },
	{ nombre: 'cursiva', keys: 'ControlOrMeta+i', tag: 'em' },
	{ nombre: 'subrayado', keys: 'ControlOrMeta+u', tag: 'u' },
	{ nombre: 'tachado', keys: 'ControlOrMeta+Shift+s', tag: 's' }
]) {
	test(`atajo de ${nombre}: un Deshacer quita solo el formato`, async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Nueva nota' }).click();
		await title(page).fill(`Formato E2E: atajo ${nombre}`);

		const first = page.locator('main [role="textbox"]').first();
		await first.click();
		await page.keyboard.type('palabra', { delay: 25 });
		await page.waitForTimeout(650);
		await selectAllInBlock(page, first);
		await page.keyboard.press(keys);
		await expect(first.locator(tag)).toHaveText('palabra');

		await first.click();
		await page.keyboard.press('ControlOrMeta+z');
		await expect(first.locator(tag)).toHaveCount(0);
		await expect(first).toHaveText('palabra');
	});
}
