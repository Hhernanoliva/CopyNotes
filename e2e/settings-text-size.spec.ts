import { test, expect } from '@playwright/test';
import { openApp } from './app';

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
	await openApp(page);
	await page.locator('main [data-block-id] .block-editable').first().waitFor();

	expect(await scaleVar(page)).toBe('1');
	const beforePx = await firstBlockFontPx(page);

	await page.getByRole('button', { name: 'Configuración' }).click();
	await page.getByRole('button', { name: 'Agrandar texto' }).click();

	// El texto detrás del diálogo crece de inmediato.
	expect(await scaleVar(page)).toBe('1.1');
	expect(await firstBlockFontPx(page)).toBeGreaterThan(beforePx);

	// Recarga inmediata, sin esperar a que la escritura aterrice: es el caso que
	// se perdía (la base descarta lo que se empieza a escribir mientras la página
	// muere) y el que ahora cubre el apunte de preferencias en journal.ts.
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
	await openApp(page);
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
	await openApp(page);
	await page.getByRole('button', { name: 'Configuración' }).click();

	await expect(page.getByRole('heading', { name: 'Nube' })).toBeVisible();
	await expect(page.getByText('no tiene una nube configurada')).toBeVisible();
	// `exact` a propósito: el botón de la nube se llama justo "Entrar", y sin él
	// cuenta cualquier botón cuyo nombre EMPIECE así.
	await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toHaveCount(0);
	// El diálogo sigue vivo debajo: la sección no tapó ni rompió el resto.
	await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible();
});

test.describe('con movimiento reducido', () => {
	test.use({ reducedMotion: 'reduce' });

	test('el diálogo funciona y el tamaño cambia sin animación', async ({ page }) => {
		await openApp(page);
		await page.getByRole('button', { name: 'Configuración' }).click();
		await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
		await page.getByRole('button', { name: 'Agrandar texto' }).click();
		expect(await scaleVar(page)).toBe('1.1');
	});
});

// La marca del renglón (la casilla de tarea, la viñeta) se centra en la PRIMERA
// LÍNEA del texto, y esa línea crece con el tamaño elegido acá. La separación
// era fija: quedaba centrada al 100% y 6,5px corrida al 160%. Se mide el centro
// de la caja contra el centro de la línea; si vuelve a atarse a un valor fijo,
// la segunda medición (al 140%) se corre varios píxeles y esto falla.
function markerOffsetPx(page) {
	return page.evaluate(() => {
		const box = document.querySelector('main [role="checkbox"] span');
		const text = box.closest('.cn-row').querySelector('.block-editable');
		const range = document.createRange();
		range.selectNodeContents(text);
		const line = range.getClientRects()[0];
		const rect = box.getBoundingClientRect();
		return rect.top + rect.height / 2 - (line.top + line.height / 2);
	});
}

test('la casilla de tarea queda centrada en su renglón en cualquier tamaño', async ({ page }) => {
	await openApp(page);
	await page.locator('main [role="checkbox"]').first().waitFor();
	expect(Math.abs(await markerOffsetPx(page))).toBeLessThan(1.5);

	await page.getByRole('button', { name: 'Configuración' }).click();
	const grow = page.getByRole('button', { name: 'Agrandar texto' });
	// 100 → 110 → 125 → 140. El diálogo queda abierto a propósito: el texto de
	// atrás ya creció y se puede medir sin esperar a que se cierre.
	await grow.click();
	await grow.click();
	await grow.click();
	expect(await scaleVar(page)).toBe('1.4');

	expect(Math.abs(await markerOffsetPx(page))).toBeLessThan(1.5);
});
