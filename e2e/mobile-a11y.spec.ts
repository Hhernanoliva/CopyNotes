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
	const editBox = await row.locator('.block-editable').first().boundingBox();
	const badgeBox = await badge.boundingBox();
	// el tope del badge se alinea con el primer renglón del texto (no centrado)
	expect(badgeBox.y - editBox.y).toBeLessThan(16);
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

test('el botón de borrar nota se ve al tacto en la barra lateral', async ({ page }) => {
	await page.goto('/');

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

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.press('ControlOrMeta+A');
	await first.pressSequentially('borrame');
	await first.press('Enter');
	await page.locator('main [data-block-id] .block-editable').nth(1).pressSequentially('quedo yo');

	// Los controles salen solo en la fila activa: hay que enfocar la primera
	// para que aparezca su menú (mismo flujo que hace el usuario al tacto).
	await first.click();
	await page.getByRole('button', { name: 'Más acciones' }).first().click();
	await page.getByRole('menuitem', { name: 'Eliminar' }).click();

	await expect(page.getByText('borrame')).toHaveCount(0);
	await expect(page.getByText('quedo yo')).toBeVisible();
});
