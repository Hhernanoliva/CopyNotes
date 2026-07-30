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

// Nube (spec 030 fase 2). Prueba de humo: la sección se abre sin romper, tanto
// en una build con proyecto Supabase como en una sin él. Deliberadamente NO
// afirma en cuál de los dos estados está: eso depende de si la máquina que corre
// la suite tiene un `.env`, y una prueba que cambia de resultado según eso no
// prueba nada. Los dos estados los cubre `sync/supabase.test.ts`, con el entorno
// fijado.
test('la sección Nube se abre sin romper el diálogo', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Configuración' }).click();

	await expect(page.getByRole('heading', { name: 'Nube' })).toBeVisible();
	await expect(page.getByText('Se cifran acá, antes de salir')).toBeVisible();
	// El diálogo sigue vivo debajo: la sección nueva no tapó ni rompió el resto.
	await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible();
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
