import { expect } from '@playwright/test';

// Abrir la app en una prueba, sin ganarle de mano.
//
// La página se sirve pre-renderizada, así que la cabecera y sus botones existen
// en el HTML ANTES de que la app se conecte a ellos. `page.goto()` vuelve en
// cuanto llega ese HTML, y un clic en esa ventana no hace nada y no avisa: la
// prueba sigue como si hubiera abierto algo y falla varios segundos después,
// lejos de la causa. Con la suite entera en paralelo la ventana se agranda, y
// por eso el síntoma es siempre el mismo — falla acompañada, pasa sola.
//
// La señal de que la app despertó es que haya un renglón dibujado: mientras
// arranca, `+page.svelte` pinta un esqueleto en su lugar. Sirve en cualquier
// estado (primera visita, notas ya sembradas, respaldo importado), a diferencia
// de esperar el título de la nota de bienvenida, que sólo existe en la primera.
export async function openApp(page) {
	await page.goto('/');
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
}

// El arranque más repetido de la suite: abrir y crear una nota vacía para
// trabajar. Existía copiado en ~80 pruebas como `goto` + clic, que es
// exactamente el par que se corre la carrera descrita arriba.
export async function newNote(page) {
	await openApp(page);
	await page.getByRole('button', { name: 'Nueva nota' }).click();
}
