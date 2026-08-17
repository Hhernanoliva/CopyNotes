import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Compartir una nota (spec 038, parte A). Lo que se prueba acá es lo que se ve:
// que el aviso sobre la privacidad esté ANTES de compartir y con esas palabras,
// y que sin cuenta la app lo diga en vez de hacer algo a medias. Lo que pasa
// después —el segundo caño, la mudanza— vive en las pruebas de unidad, y el
// recorrido completo entre dos aparatos es un gate manual.

test('el aviso de que la nota sale de la bóveda está antes de compartir', async ({ page }) => {
	await openApp(page);

	await page.getByRole('button', { name: /^Compartir nota/ }).first().click();

	await expect(page.getByRole('heading', { name: 'Compartir nota' })).toBeVisible();
	await expect(
		page.getByText(/sale de la bóveda y deja de estar cifrada/i)
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Compartir esta nota' })).toBeVisible();
});

test('sin cuenta lo dice, en vez de compartir a medias', async ({ page }) => {
	await openApp(page);

	await page.getByRole('button', { name: /^Compartir nota/ }).first().click();
	await page.getByRole('button', { name: 'Compartir esta nota' }).click();

	await expect(page.getByText(/tenés que entrar a tu cuenta/i)).toBeVisible();
	// Y la nota sigue sin compartir: el botón es el mismo, no cambió a "Dejar de
	// compartir".
	await expect(page.getByRole('button', { name: 'Compartir esta nota' })).toBeVisible();
});

// La invitación (parte B1). Acá se prueba sólo lo que no necesita un servidor:
// que sin sesión la pantalla lo diga en vez de hacer algo a medias, y que el
// token no se quede en la barra de direcciones. El canje de verdad es un gate
// manual con dos cuentas.
test('un link de invitación sin sesión pide entrar a la cuenta', async ({ page }) => {
	await openApp(page, '/?invitacion=tok123');

	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toBeVisible();
	await expect(page.getByText(/necesitás entrar a tu cuenta/i)).toBeVisible();
});

// Un token en la barra sobrevive a un favorito, a una captura y a compartir la
// pantalla.
test('el token de la invitación desaparece de la dirección', async ({ page }) => {
	await openApp(page, '/?invitacion=tok123');

	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toBeVisible();
	expect(page.url()).not.toContain('invitacion');
});

// Y se ofrece UNA vez: si el token quedara guardado, la próxima visita volvería a
// mostrar una invitación que la persona ya resolvió.
test('la invitación no reaparece en la visita siguiente', async ({ page }) => {
	await openApp(page, '/?invitacion=tok123');
	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toBeVisible();

	await openApp(page);

	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toHaveCount(0);
});

// El candado: una nota que te comparten se lee, no se escribe.
//
// La marca se planta en IndexedDB directo y no importando módulos de la app:
// contra la build de preview no existen las rutas `/src`. El diálogo y el editor
// releen al montarse, así que alcanza con recargar.
async function marcarComoAjena(page) {
	await page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const abrir = indexedDB.open('copynotes');
				abrir.onerror = () => reject(abrir.error);
				abrir.onsuccess = () => {
					const tx = abrir.result.transaction('notes', 'readwrite');
					const store = tx.objectStore('notes');
					store.getAll().onsuccess = (evento) => {
						const nota = evento.target.result[0];
						store.put({ ...nota, share: 'member' });
					};
					tx.oncomplete = () => resolve(null);
					tx.onerror = () => reject(tx.error);
				};
			})
	);
	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
}

test('una nota que te comparten no se puede escribir', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	await expect(page.locator('main [data-block-surface]').first()).toHaveAttribute(
		'contenteditable',
		'false'
	);
});

// El teclado es una puerta de varias. El menú del renglón las tiene casi todas
// juntas —mover, borrar, etiquetar, guardar como fragmento— y en celular es la
// única forma de llegar a ellas.
// El control de la primera mitad NO es decorativo: la primera versión de esta
// prueba buscaba "Acciones del bloque", que es el nombre del menú ABIERTO y no
// del botón que lo abre, así que daba verde con el candado puesto y sin poner.
// Comprobar primero que en una nota propia el botón SÍ está es lo que impide que
// vuelva a pasar.
test('en una nota que te comparten no está el menú del renglón', async ({ page }) => {
	await openApp(page);
	const menu = page.getByRole('button', { name: 'Más acciones' });
	expect(await menu.count()).toBeGreaterThan(0);

	await marcarComoAjena(page);

	await expect(menu).toHaveCount(0);
});

// Y la casilla de una tarea, que escribe el renglón sin pasar por el teclado.
test('en una nota que te comparten la casilla no se puede tocar', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	const casilla = page.getByRole('checkbox').first();
	await expect(casilla).toBeDisabled();
});
