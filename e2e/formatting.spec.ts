import { test, expect } from '@playwright/test';
import { newNote } from './app';

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

// Mark only part of the row's text — the gesture that spec 032 routes to the
// inline size instead of converting the whole block.
async function selectRangeInBlock(page, editable, start, end) {
	await editable.evaluate((el, [from, to]) => {
		const textNode = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
		const range = document.createRange();
		range.setStart(textNode, from);
		range.setEnd(textNode, to);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}, [start, end]);
}

test('selecting text shows the formatting toolbar', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: toolbar');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('seleccioname', { delay: 25 });
	await selectAllInBlock(page, first);

	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
});

test('the toolbar waits a beat before appearing on a fresh selection', async ({ page }) => {
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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

	// Reabrir el popover MARCANDO el texto enlazado (así la barra detecta el href
	// y muestra "Quitar") y quitarlo. Con el cursor solo la barra ya no se abre:
	// aparecía sola al caminar el renglón. Y un clic sobre el enlace hoy se lo
	// lleva al navegador, así que tampoco sirve para pararse encima.
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
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
	await newNote(page);
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
	await newNote(page);
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

test('un clic sobre el enlace lo abre en una pestaña nueva, con o sin Ctrl/Cmd', async ({
	page
}) => {
	await newNote(page);
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

	// Un clic pelado alcanza. Es el único camino que existe en celular, donde no
	// hay Ctrl/Cmd para mantener apretado.
	const [popup] = await Promise.all([page.waitForEvent('popup'), first.locator('a').click()]);
	expect(popup.url()).toContain('ejemplo.com');
	await popup.close();

	// Y Ctrl/Cmd+clic, que era la única forma antes, sigue funcionando.
	const [modPopup] = await Promise.all([
		page.waitForEvent('popup'),
		first.locator('a').click({ modifiers: ['ControlOrMeta'] })
	]);
	expect(modPopup.url()).toContain('ejemplo.com');
	await modPopup.close();
});

// Lo que reportó Hernan: la barra se abría sola al pararse sobre un enlace, sin
// haber marcado nada. Pasaba con cualquier formato, no sólo enlaces.
test('la barra no se abre por pararse encima del texto formateado', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: barra sin selección');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio y mas texto', { delay: 25 });
	await page.waitForTimeout(650);

	// Enlazar sólo la primera palabra.
	await selectRangeInBlock(page, first, 0, 5);
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter');
	await expect(first.locator('a')).toHaveText('sitio');
	await page.keyboard.press('Escape');

	const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
	await expect(toolbar).toBeHidden();

	// Caminar el renglón con las flechas hasta quedar adentro del enlace: el
	// cursor solo no abre nada.
	await first.click();
	await page.keyboard.press('Home');
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(500);
	await expect(toolbar).toBeHidden();

	// Y marcando sí se abre, que es el gesto que la pide.
	await selectAllInBlock(page, first);
	await expect(toolbar).toBeVisible();
});

test('marcar la palabra enlazada trae su dirección actual para cambiarla', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: cambiar dirección');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://viejo.com');
	await page.keyboard.press('Enter');
	await expect(first.locator('a')).toHaveAttribute('href', 'https://viejo.com/');
	await page.keyboard.press('Escape');

	// Marcar la palabra enlazada y reabrir: el cuadrito tiene que venir con la
	// dirección puesta, no vacío.
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await expect(page.getByLabel('URL del enlace')).toHaveValue('https://viejo.com/');

	await page.getByLabel('URL del enlace').fill('https://nuevo.com');
	await page.keyboard.press('Enter');

	// Se cambió el enlace que ya estaba, no se envolvió uno adentro de otro.
	await expect(first.locator('a')).toHaveCount(1);
	await expect(first.locator('a')).toHaveAttribute('href', 'https://nuevo.com/');
	await expect(first.locator('a')).toHaveText('sitio');
});

test('arrastrar sobre el enlace lo selecciona para editarlo, no lo abre', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: seleccionar enlace');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com');
	await page.keyboard.press('Enter');
	await expect(first.locator('a')).toHaveText('sitio');
	await page.keyboard.press('Escape');

	// Arrastrar de punta a punta del enlace: el clic que cierra el arrastre NO
	// tiene que llevarse al usuario de la nota, porque lo que quiso fue marcar
	// el texto para cambiarle la dirección.
	const box = await first.locator('a').boundingBox();
	const y = box.y + box.height / 2;
	const popupOrNothing = page.waitForEvent('popup', { timeout: 1500 }).catch(() => null);
	await page.mouse.move(box.x + 1, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 1, y, { steps: 8 });
	await page.mouse.up();

	expect(await popupOrNothing).toBeNull();
	// Y quedó texto marcado, que es lo que el arrastre venía a hacer.
	expect(await page.evaluate(() => window.getSelection().toString())).toBe('sitio');
});

test('deshacer restaura el formato que se acababa de limpiar', async ({ page }) => {
	await newNote(page);
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
	await newNote(page);
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
	await newNote(page);
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
		await newNote(page);
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

// --- Tamaño sobre una parte del renglón (spec 032) ---
// El mismo botón hace dos gestos: renglón entero = título de verdad, una parte =
// solo se agranda lo marcado, en la misma línea.

test('marcar una parte y apretar H1 agranda solo eso, sin convertir el renglón', async ({
	page
}) => {
	await newNote(page);
	await title(page).fill('Formato E2E: tamaño parcial');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Precios de temporada — el resto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectRangeInBlock(page, first, 0, 20);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first.locator('.fmt-size-h1')).toHaveText('Precios de temporada');
	// El renglón sigue siendo texto: no se convirtió en encabezado ni se partió.
	await expect(first).not.toHaveClass(/block-editable--h1/);
	await expect(first).toHaveText('Precios de temporada — el resto');
	await expect(page.locator('main [role="textbox"]')).toHaveCount(1);

	await page.waitForTimeout(700); // que el guardado automático descargue
	await page.reload();
	await expect(title(page)).toHaveValue('Formato E2E: tamaño parcial');
	const restored = page.locator('main [role="textbox"]').first();
	await expect(restored.locator('.fmt-size-h1')).toHaveText('Precios de temporada');
	await expect(restored).not.toHaveClass(/block-editable--h1/);
});

test('marcar el renglón entero y apretar H1 sigue haciendo un título de verdad', async ({
	page
}) => {
	await newNote(page);
	await title(page).fill('Formato E2E: tamaño entero');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo entero', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first).toHaveClass(/block-editable--h1/);
	await expect(first.locator('.fmt-size-h1')).toHaveCount(0);
	await expect(first).toHaveText('Titulo entero');
});

test('apretar H1 dos veces sobre lo mismo deja el texto como estaba', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: tamaño ida y vuelta');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Precios de temporada — el resto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectRangeInBlock(page, first, 0, 20);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first.locator('.fmt-size-h1')).toHaveCount(1);

	// La barra deja seleccionado lo que acaba de marcar, así que el segundo
	// clic cae sobre el mismo texto.
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first.locator('.fmt-size-h1')).toHaveCount(0);
	await expect(first).toHaveText('Precios de temporada — el resto');
});

// Pasear el cursor por el renglón no es pedir la barra. El tamaño no se puede
// tocar sin algo marcado (el botón no haría nada con el cursor solo), así que
// entrar al texto agrandado no debe abrirla sola.
test('mover el cursor dentro del texto agrandado no abre la barra sola', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: la barra no se abre sola');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Precios de temporada — el resto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectRangeInBlock(page, first, 0, 20);
	const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
	await expect(toolbar).toBeVisible();
	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first.locator('.fmt-size-h1')).toHaveCount(1);

	// Salir del texto agrandado con el cursor: la barra se va.
	await first.click();
	await page.keyboard.press('End');
	await expect(toolbar).toHaveCount(0);

	// Y volver a entrar caminando con las flechas la deja cerrada.
	for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(400); // más que el retardo con el que aparece
	await expect(toolbar).toHaveCount(0);
});

test('deshacer revierte el tamaño en línea, sin borrar el texto', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: deshacer tamaño');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Precios de temporada — el resto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectRangeInBlock(page, first, 0, 20);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Título 2' }).click();
	await expect(first.locator('.fmt-size-h2')).toHaveCount(1);

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('.fmt-size-h2')).toHaveCount(0);
	await expect(first).toHaveText('Precios de temporada — el resto');
});

// --- La barra sin mouse (spec 033) ---

test('Ctrl/Cmd+Alt+1 sobre el renglón entero lo convierte en título', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: atajo tamaño');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo por atajo', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+Alt+Digit1');
	await expect(first).toHaveClass(/block-editable--h1/);

	// Repetir el atajo lo apaga: vuelve a texto normal, como el botón, que se
	// muestra apretado.
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+Alt+Digit1');
	await expect(first).not.toHaveClass(/block-editable--h1/);
	await expect(first).toHaveText('Titulo por atajo');

	// Y un solo Deshacer revierte ese apagado: comparte la puerta con el resto
	// del formato.
	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first).toHaveClass(/block-editable--h1/);
});

test('el botón Título 1 apretado dos veces también vuelve a texto normal', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: título ida y vuelta');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo con boton', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first).toHaveClass(/block-editable--h1/);

	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Título 1' }).click();
	await expect(first).not.toHaveClass(/block-editable--h1/);
	await expect(first).toHaveText('Titulo con boton');
});

test('con el cursor solo, el atajo repetido apaga el título', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: apagar con cursor solo');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Sin seleccionar nada', { delay: 25 });
	await page.waitForTimeout(650);
	await page.keyboard.press('ControlOrMeta+Alt+Digit2');
	await expect(first).toHaveClass(/block-editable--h2/);
	await page.keyboard.press('ControlOrMeta+Alt+Digit2');
	await expect(first).not.toHaveClass(/block-editable--h2/);
	await expect(first).toHaveText('Sin seleccionar nada');
});

test('Ctrl/Cmd+Alt+2 sobre una parte agranda solo eso', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: atajo parcial');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Precios de temporada — el resto', { delay: 25 });
	await page.waitForTimeout(650);
	await selectRangeInBlock(page, first, 0, 20);
	await page.keyboard.press('ControlOrMeta+Alt+Digit2');
	await expect(first.locator('.fmt-size-h2')).toHaveText('Precios de temporada');
	await expect(first).not.toHaveClass(/block-editable--h2/);
});

test('con el cursor solo, sin nada marcado, el atajo convierte el renglón entero', async ({
	page
}) => {
	await newNote(page);
	await title(page).fill('Formato E2E: atajo con cursor solo');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Sin seleccionar nada', { delay: 25 });
	await page.waitForTimeout(650);
	// Cursor parado, cero selección.
	await page.keyboard.press('ControlOrMeta+Alt+Digit3');
	await expect(first).toHaveClass(/block-editable--h3/);
	await expect(first.locator('.fmt-size-h3')).toHaveCount(0);
});

test('con texto marcado, Tab entra en la barra', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: Tab entra');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('marcado', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Título 1' })).toBeFocused();

	// Y de ahí se camina y se aplica sin tocar el mouse.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(first).toHaveClass(/block-editable--h2/);

	// Elegir con el teclado cierra la barra y devuelve el cursor al texto, listo
	// para seguir escribiendo.
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toHaveCount(0);
	await expect(first).toBeFocused();
	await page.keyboard.type(' y sigo', { delay: 25 });
	await expect(first).toHaveText('marcado y sigo');
});

test('con el mouse la barra queda abierta, para aplicar dos formatos seguidos', async ({
	page
}) => {
	await newNote(page);
	await title(page).fill('Formato E2E: la barra sigue abierta con mouse');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('dos formatos', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
	await expect(toolbar).toBeVisible();

	await page.getByRole('button', { name: 'Negrita' }).click();
	await expect(first.locator('strong')).toHaveText('dos formatos');
	await expect(toolbar).toBeVisible();

	await page.getByRole('button', { name: 'Cursiva' }).click();
	await expect(first.locator('em')).toHaveText('dos formatos');
});

test('sin nada marcado, Tab sigue anidando el renglón', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: Tab sigue anidando');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('padre', { delay: 25 });
	await page.keyboard.press('Enter');
	await page.keyboard.type('hijo', { delay: 25 });

	// Cursor parado, cero selección: Tab anida como siempre (el renglón hijo se
	// corre a la derecha).
	await page.keyboard.press('Tab');
	const pads = await page
		.locator('main .group')
		.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).paddingLeft) || 0));
	expect(pads.some((p) => p > 0)).toBeTruthy();
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toHaveCount(0);
});

test('Ctrl/Cmd+Alt+F entra en la barra y las flechas la caminan hasta aplicar', async ({
	page
}) => {
	await newNote(page);
	await title(page).fill('Formato E2E: caminar la barra');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('caminando', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+Alt+KeyF');
	await expect(page.getByRole('button', { name: 'Título 1' })).toBeFocused();

	// Dos a la derecha: Título 3. Enter aplica y el foco vuelve al texto.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('button', { name: 'Título 3' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(first).toHaveClass(/block-editable--h3/);
	await expect(first).toBeFocused();
});

test('Tab aplica el botón enfocado, igual que Enter', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: Tab aplica');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('con tab', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+Alt+KeyF');
	// Fin lleva al último botón; Shift+Tab vuelve uno; las puntas no dan la vuelta.
	await page.keyboard.press('End');
	await expect(page.getByRole('button', { name: 'Más opciones' })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: 'Color de texto' })).toBeFocused();

	await page.keyboard.press('Home');
	await expect(page.getByRole('button', { name: 'Título 1' })).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(page.getByRole('button', { name: 'Título 1' })).toBeFocused();

	await page.keyboard.press('Tab');
	await expect(first).toHaveClass(/block-editable--h1/);
});

test('elegir un color sin mouse: entrar, abrir el panel, caminarlo y aplicar', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: color sin mouse');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('coloreado', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+Alt+KeyF');
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowLeft'); // Color de texto
	await expect(page.getByRole('button', { name: 'Color de texto' })).toBeFocused();

	// Enter abre la paleta y se lleva el foco adentro.
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menuitemradio', { name: 'Por defecto' })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight'); // Por defecto → Ámbar → Rojo
	await expect(page.getByRole('menuitemradio', { name: 'Rojo' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(first.locator('.fmt-color-red')).toHaveCount(1);
});

test('Escape adentro de un panel vuelve al botón que lo abrió, no al texto', async ({ page }) => {
	await newNote(page);
	await title(page).fill('Formato E2E: escape del panel');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('escapando', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+Alt+KeyF');
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menuitemradio', { name: 'Por defecto' })).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('menuitemradio', { name: 'Por defecto' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Color de texto' })).toBeFocused();

	// Un Escape más sale al texto, sin haber aplicado nada.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toHaveCount(0);
	await expect(first).toBeFocused();
	await expect(first.locator('.fmt-color-red')).toHaveCount(0);
});

// Los tres paneles de la barra (color, enlace, "Más opciones") se abren DEBAJO
// de la fila de botones. Esa fila tiene scroll lateral para que en el celular la
// barra no se salga de la pantalla, y un contenedor con scroll recorta todo lo
// que se sale de su caja: los paneles quedaban visibles al 13%. Deben colgar de
// una capa exterior sin recorte.
for (const [boton, panel] of [
	['Color de texto', '[role="menu"][aria-label="Color de texto"]'],
	['Enlace', '[role="dialog"][aria-label="Editar enlace"]'],
	['Más opciones', '[role="menu"]:not([aria-label])']
]) {
	test(`el panel "${boton}" se ve entero, sin recorte de la barra`, async ({ page }) => {
		await newNote(page);
		await title(page).fill(`Formato E2E: panel ${boton}`);

		const first = page.locator('main [role="textbox"]').first();
		await first.click();
		await page.keyboard.type('texto', { delay: 25 });
		await page.waitForTimeout(650);
		await selectAllInBlock(page, first);

		const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
		await expect(toolbar).toBeVisible();
		await page.getByRole('button', { name: boton, exact: true }).click();

		// Prueba de verdad: ¿el panel recibe el toque en sus cuatro esquinas? Un
		// panel recortado sigue existiendo en el DOM y con caja propia, pero el
		// clic cae en lo que está debajo. Playwright desplaza el contenedor antes
		// de hacer clic, así que medir a mano es la única forma de ver lo que ve
		// una persona.
		const alcanzables = await toolbar.evaluate((el, sel) => {
			const pop = el.querySelector(sel);
			if (!pop) return { error: 'panel no encontrado' };
			const b = pop.getBoundingClientRect();
			const i = 3; // adentro del borde, para no caer en el redondeo de la esquina
			const puntos = {
				'arriba-izq': [b.left + i, b.top + i],
				'arriba-der': [b.right - i, b.top + i],
				'abajo-izq': [b.left + i, b.bottom - i],
				'abajo-der': [b.right - i, b.bottom - i]
			};
			const perdidos = [];
			for (const [nombre, [x, y]] of Object.entries(puntos)) {
				const hit = document.elementFromPoint(x, y);
				if (!hit || !pop.contains(hit)) perdidos.push(nombre);
			}
			return { perdidos };
		}, panel);

		expect(alcanzables).toEqual({ perdidos: [] });
	});
}

// La barra de formato viaja con el texto marcado al scrollear. Se medía una
// sola vez, cuando cambiaba la selección, así que quedaba clavada en la
// pantalla mientras la nota se movía por debajo.
test('la barra de formato queda pegada al texto marcado al scrollear', async ({ page }) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	for (let i = 0; i < 40; i++) {
		await page.keyboard.type(`Renglon numero ${i} con texto`);
		await page.keyboard.press('Enter');
		await page.waitForTimeout(50);
	}
	await page.waitForTimeout(300);

	const target = page.locator('main [data-block-id] .block-editable').nth(35);
	await target.click();
	await selectRangeInBlock(page, target, 0, 7);
	await expect(page.locator('[data-copynotes-toolbar]')).toBeVisible();
	await page.waitForTimeout(300); // dejar terminar la animación de entrada

	// Distancia entre la barra y el texto marcado: es lo que tiene que quedar igual.
	const gap = () =>
		page.evaluate(() => {
			const bar = document.querySelector('[data-copynotes-toolbar]').getBoundingClientRect();
			const sel = window.getSelection().getRangeAt(0).getBoundingClientRect();
			return Math.round(Math.abs(sel.top - bar.bottom));
		});

	const before = await gap();
	expect(before).toBeLessThan(20); // pegada, no flotando
	await page.evaluate(() => document.querySelector('main').scrollBy(0, -180));
	await page.waitForTimeout(300);
	expect(Math.abs((await gap()) - before)).toBeLessThan(3);
});
