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
	const badge = page.getByRole('button', { name: 'Cambiar fecha' });
	const rowBox = await row.boundingBox();
	const badgeBox = await badge.boundingBox();
	// el tope del badge está cerca del tope de la fila (no centrado verticalmente)
	expect(badgeBox.y - rowBox.y).toBeLessThan(16);
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

test('los controles de la línea son visibles al tacto sin hover', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await line.pressSequentially('una línea');

	// sin hover: el clúster de acciones debe estar visible (opacity 1)
	const copy = page.getByRole('button', { name: 'Copiar bloque' }).first();
	await expect(copy).toBeVisible();
	const opacity = await copy.evaluate((el) =>
		getComputedStyle(el.closest('.cn-affordance')).opacity
	);
	expect(Number(opacity)).toBe(1);
});
