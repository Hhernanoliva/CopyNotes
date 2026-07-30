import { test, expect } from '@playwright/test';

// Configuración → Tamaño de texto (spec 027). El engranaje abre el diálogo;
// A+ agranda solo el texto de la nota (variable --cn-editor-scale en <html>) y
// la elección sobrevive a la recarga.

function scaleVar(page) {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--cn-editor-scale').trim()
	);
}

// El valor tal como quedó en la base local, no el que se ve en pantalla. Se
// guarda en IndexedDB, y una recarga disparada en el mismo instante del clic
// puede matar esa escritura antes de que aterrice — así que "persiste tras
// recargar" solo se puede afirmar después de comprobar que se guardó.
function storedScale(page) {
	return page.evaluate(
		() =>
			new Promise((resolve) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => resolve(null);
				open.onsuccess = () => {
					try {
						const request = open.result
							.transaction('settings', 'readonly')
							.objectStore('settings')
							.get('editorTextScale');
						request.onsuccess = () => resolve(request.result?.value ?? null);
						request.onerror = () => resolve(null);
					} catch {
						resolve(null);
					}
				};
			})
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

	// Primero que quede guardado; recién ahí tiene sentido recargar.
	await expect.poll(() => storedScale(page)).toBe(1.1);

	await page.reload();
	await page.locator('main [data-block-id] .block-editable').first().waitFor();
	// La preferencia se aplica DESPUÉS de que el editor ya está en pantalla, así
	// que medir apenas aparece el primer renglón a veces agarra el 100% inicial.
	// Lo que se afirma es que el tamaño elegido sobrevive a la recarga, no en qué
	// milisegundo se aplica.
	await expect.poll(() => scaleVar(page)).toBe('1.1');
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

// Nube (spec 030). La suite se compila sin proyecto Supabase (ver
// playwright.config.ts), que es exactamente el caso de una instalación 100%
// local: la sección tiene que abrirse, decirlo, y no pedir nada. Los dos estados
// del interruptor los cubre `sync/supabase.test.ts` con el entorno fijado.
test('la sección Nube avisa que no hay nube configurada y no pide nada', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Configuración' }).click();

	await expect(page.getByRole('heading', { name: 'Nube' })).toBeVisible();
	await expect(page.getByText('no tiene una nube configurada')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);
	// El diálogo sigue vivo debajo: la sección no tapó ni rompió el resto.
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
