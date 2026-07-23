import { test, expect } from '@playwright/test';

// Configuración → Tamaño de texto (spec 027). El engranaje abre el diálogo;
// A+ agranda solo el texto de la nota (variable --cn-editor-scale en <html>) y
// la elección sobrevive a la recarga.

function scaleVar(page) {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--cn-editor-scale').trim()
	);
}

function firstBlockFontPx(page) {
	return page
		.locator('main [data-block-id] .block-editable')
		.first()
		.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

test('A+ agranda el texto de la nota y persiste tras recargar', async ({ page }) => {
	await page.goto('/');
	await page.locator('main [data-block-id] .block-editable').first().waitFor();

	expect(await scaleVar(page)).toBe('1');
	const beforePx = await firstBlockFontPx(page);

	await page.getByRole('button', { name: 'Configuración' }).click();
	await page.getByRole('button', { name: 'Agrandar texto' }).click();

	// El texto detrás del diálogo crece de inmediato.
	expect(await scaleVar(page)).toBe('1.1');
	expect(await firstBlockFontPx(page)).toBeGreaterThan(beforePx);

	await page.reload();
	await page.locator('main [data-block-id] .block-editable').first().waitFor();
	expect(await scaleVar(page)).toBe('1.1');
	expect(await firstBlockFontPx(page)).toBeGreaterThan(beforePx);
});

test('A− se deshabilita en el mínimo (90%)', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Configuración' }).click();

	const shrink = page.getByRole('button', { name: 'Achicar texto' });
	// 100 → 90 (un paso), y ahí queda deshabilitado.
	await shrink.click();
	expect(await scaleVar(page)).toBe('0.9');
	await expect(shrink).toBeDisabled();
});

test.describe('con movimiento reducido', () => {
	test.use({ reducedMotion: 'reduce' });

	test('el diálogo funciona y el tamaño cambia sin animación', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Configuración' }).click();
		await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
		await page.getByRole('button', { name: 'Agrandar texto' }).click();
		expect(await scaleVar(page)).toBe('1.1');
	});
});
