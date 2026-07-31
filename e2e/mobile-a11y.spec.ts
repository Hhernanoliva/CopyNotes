import { test, expect } from '@playwright/test';

// Accesibilidad mobile/tablet del editor. Viewport de celular con toque; en
// las tareas que dependen de "sin hover" se agrega isMobile para que Chromium
// reporte (hover: none) / (pointer: coarse).
test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

test('la fecha queda arriba en una línea de varios renglones', async ({ page }) => {
	await page.goto('/');

	// Arranca con la nota demo; trabajamos sobre su primer renglón.
	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('palabra '.repeat(40)); // fuerza varios renglones

	// asignar fecha vía slash
	await line.pressSequentially('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.getByRole('option', { name: 'Fecha' }).click();
	await page.getByRole('button', { name: 'Hoy' }).click();

	const row = page.locator('main [data-block-id]').first();
	const badge = row.getByRole('button', { name: 'Cambiar fecha' });
	await expect(badge).toBeVisible();
	// El comando "/fecha" ya se consumió: el renglón vuelve a su texto y no
	// quedan reflows pendientes que muevan el badge mientras lo medimos.
	await expect(row.locator('.block-editable').first()).not.toContainText('/fecha');
	// El chip de fecha entra con una animación de rebote (spec 024), así que medir
	// apenas aparece devuelve la posición de un fotograma intermedio. Se re-mide
	// hasta que se asienta: la afirmación sigue siendo "termina alineado arriba",
	// y deja de depender de en qué momento del rebote cayó la medición.
	await expect
		.poll(async () => {
			const editBox = await row.locator('.block-editable').first().boundingBox();
			const badgeBox = await badge.boundingBox();
			return badgeBox.y - editBox.y;
		})
		// el tope del badge se alinea con el primer renglón del texto (no centrado)
		.toBeLessThan(16);
});

test('la barra de formato no supera el ancho de la pantalla', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('texto para seleccionar');
	await page.keyboard.press('ControlOrMeta+A'); // selecciona el renglón

	const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
	await toolbar.waitFor();
	const box = await toolbar.boundingBox();
	const vw = page.viewportSize().width;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(vw);
});

test('al tacto, los controles aparecen solo en la fila activa', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('una línea');

	// La fila enfocada (donde está el cursor) muestra sus controles: opacity 1
	// (se espera a que termine la transición de aparición).
	await expect
		.poll(() =>
			page
				.getByRole('button', { name: 'Copiar bloque' })
				.first()
				.evaluate((el) => Number(getComputedStyle(el.closest('.cn-affordance')).opacity))
		)
		.toBe(1);

	// Una fila que NO está enfocada mantiene sus controles ocultos: opacity 0.
	const otherOpacity = await page
		.getByRole('button', { name: 'Copiar bloque' })
		.nth(2)
		.evaluate((el) => getComputedStyle(el.closest('.cn-affordance')).opacity);
	expect(Number(otherOpacity)).toBe(0);
});

test('la X de quitar etiqueta tiene área táctil de 44px', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('con etiqueta #urgente ');

	const x = page.getByRole('button', { name: /Quitar etiqueta/ }).first();
	// El área tocable la aporta el pseudo-elemento .cn-tap::after (44px), que no
	// agranda la caja visible del botón; se mide sobre el pseudo.
	const size = await x.evaluate((el) => {
		const s = getComputedStyle(el, '::after');
		return { w: parseFloat(s.width), h: parseFloat(s.height) };
	});
	expect(size.w).toBeGreaterThanOrEqual(44);
	expect(size.h).toBeGreaterThanOrEqual(44);
});

test('el botón de copiar tiene área táctil de 44px', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('copiame');

	const copy = page.getByRole('button', { name: 'Copiar bloque' }).first();
	const size = await copy.evaluate((el) => {
		const s = getComputedStyle(el, '::after');
		return { w: parseFloat(s.width), h: parseFloat(s.height) };
	});
	expect(size.w).toBeGreaterThanOrEqual(44);
	expect(size.h).toBeGreaterThanOrEqual(44);
});

test('el checkbox de tarea tiene área táctil de 44px', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('End');
	await page.keyboard.press('Enter'); // renglón nuevo vacío
	await page.keyboard.type('/tarea');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.getByRole('option', { name: 'Tarea' }).click();

	const box = page.getByRole('checkbox').first();
	const size = await box.evaluate((el) => {
		const s = getComputedStyle(el, '::after');
		return { w: parseFloat(s.width), h: parseFloat(s.height) };
	});
	expect(size.w).toBeGreaterThanOrEqual(44);
	expect(size.h).toBeGreaterThanOrEqual(44);
});

test('el botón de borrar nota se ve al tacto en la barra lateral', async ({ page }) => {
	await page.goto('/');
	// La app tiene que estar viva antes de tocar nada: el título aparece cuando
	// la nota ya se leyó de la base, y eso solo pasa después de la hidratación.
	// Un clic anterior a eso no hace nada y la barra nunca se abre.
	await expect(page.getByRole('textbox', { name: 'Título de la nota' })).toBeVisible();

	// La barra lateral arranca cerrada en pantalla angosta; se abre con el botón.
	await page.getByRole('button', { name: 'Mostrar lista de notas' }).click();

	// En táctil el <button> puede no recibir :focus al tocar (iOS), así que el
	// tacho no puede depender de hover/focus-within: se muestra siempre (opacity
	// 1) vía .cn-touch-visible bajo (pointer: coarse). Antes dependía del ancho
	// (max-md) y en tablet quedaba invisible.
	const trash = page.getByRole('button', { name: /Borrar nota/ }).first();
	await expect(trash).toBeVisible();
	const opacity = await trash.evaluate((el) => Number(getComputedStyle(el).opacity));
	expect(opacity).toBe(1);
});

test('el menú de acciones permite eliminar un bloque al tacto', async ({ page }) => {
	await page.goto('/');

	const rows = page.locator('main [data-block-id]');
	const first = rows.first().locator('.block-editable');
	await first.click();
	await page.keyboard.press('ControlOrMeta+A');
	await first.pressSequentially('borrame');

	// El renglón nuevo nace cuando la base confirma la escritura: hay que
	// esperarlo, o "quedo yo" se escribe en un renglón viejo de la nota demo y
	// el foco vuelve solo al renglón nuevo cuando aparece.
	const rowCount = await rows.count();
	await first.press('Enter');
	await expect(rows).toHaveCount(rowCount + 1);
	await rows.nth(1).locator('.block-editable').pressSequentially('quedo yo');

	// Los controles salen solo en la fila activa: hay que enfocar la primera
	// para que aparezca su menú (mismo flujo que hace el usuario al tacto).
	await first.click();
	// Acotado a la primera fila: todas las filas tienen el botón, oculto salvo
	// en la activa, y un .first() global apuntaba al oculto de otra fila.
	await rows.first().getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Eliminar' }).click();

	await expect(page.getByText('borrame')).toHaveCount(0);
	await expect(page.getByText('quedo yo')).toBeVisible();
});

// En celular el menú "/" es una barra al pie y los avisos flotantes también
// viven abajo al centro, así que un aviso puede tapar la barra mientras dura
// (1,8s). Se ocultan para medir la barra sola; el choque real está anotado en
// SlashMenu.svelte.
async function sinAvisosFlotantes(page) {
	await page.addStyleTag({ content: '[data-sonner-toaster] { display: none }' });
}

test('deslizar el menú "/" no elige una opción sin querer', async ({ page }) => {
	await page.goto('/');
	await sinAvisosFlotantes(page);

	const row = page.locator('main [data-block-id]').first();
	const line = row.locator('.block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Backspace');
	await line.pressSequentially('/');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();

	// Arrastrar sobre una opción es un gesto para deslizar la lista: no elige.
	const option = page.getByRole('option', { name: 'Tarea' });
	const box = await option.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect(menu).toBeVisible();
	await expect(row.locator('[role="checkbox"]')).toHaveCount(0);

	// Tocar sin mover sí elige.
	await page.getByRole('option', { name: 'Tarea' }).click();
	await expect(row.locator('[role="checkbox"]')).toHaveCount(1);
});

test('en celular el menú "/" es una barra apoyada al pie', async ({ page }) => {
	await page.goto('/');
	await sinAvisosFlotantes(page);

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Backspace');
	await line.pressSequentially('/');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	// .cn-pop entra con un translateY de 4px: medir antes de que termine da la
	// caja a mitad de camino.
	await expect(menu).toHaveCSS('transform', 'none');

	const box = await menu.boundingBox();
	// Una sola fila de fichas, no una lista alta.
	expect(box.height).toBeLessThan(120);
	// Apoyada en el borde inferior y de borde a borde (viewport 390x780).
	expect(box.y + box.height).toBeGreaterThan(776);
	expect(box.width).toBe(390);

	// Las fichas se pueden deslizar al costado dentro de la barra.
	const overflows = await menu.evaluate((el) => el.scrollWidth > el.clientWidth);
	expect(overflows).toBe(true);

	// Y las opciones entran cómodas para el dedo (44px).
	const optionBox = await page.getByRole('option', { name: 'Viñeta' }).boundingBox();
	expect(optionBox.height).toBeGreaterThanOrEqual(44);
});
