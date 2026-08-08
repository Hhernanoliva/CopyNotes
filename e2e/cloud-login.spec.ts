import { test, expect } from '@playwright/test';

// La vuelta de Google (spec 034 fase 1). Lo que NO se puede probar acá es el
// viaje entero: la suite corre a propósito sin proyecto Supabase, y aunque lo
// tuviera, nadie puede automatizar la pantalla de consentimiento de Google sin
// falsificarla — y una falsificación se prueba a sí misma. Ese viaje es el gate
// manual (criterios 2 y 6 de la spec).
//
// Lo que sí depende de nosotros, y es lo que puede romperse en silencio: que la
// dirección quede limpia al volver, y que el aviso aparezca en vez de perderse
// en la consola. Las dos cosas viven en el efecto de arranque de
// `SettingsDialog`, que corre haya nube configurada o no.

test('volver cancelando deja la dirección limpia y lo dice en castellano', async ({ page }) => {
	await page.goto('/?error=access_denied&error_description=El+usuario+cancel%C3%B3');
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();

	// Configuración se abre sola: de ahí se fue la persona, ahí tiene que volver.
	await expect(page.getByRole('alert')).toHaveText('No se completó la entrada con Google.');
	// Ni `error` ni `error_description` sobreviven a un marcador o una captura.
	expect(page.url()).toBe(new URL('/', page.url()).toString());
});

test('el código de la vuelta no queda en la barra, y lo demás de la dirección sí', async ({
	page
}) => {
	await page.goto('/?code=4%2F0Ab_falso&nota=abc');
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();

	await expect(page.locator('dialog[open]')).toBeVisible();
	expect(page.url()).toBe(new URL('/?nota=abc', page.url()).toString());
});
