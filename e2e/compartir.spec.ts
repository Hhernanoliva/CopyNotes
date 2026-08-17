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

// Con quién estás del otro lado. El nombre del dueño se venía guardando desde
// `list_shares` y no lo mostraba nadie: `shareNameOr` existía sin un solo
// llamador. El respaldo genérico también se prueba, porque una nota compartida
// antes de que los nombres existieran llega sin ninguno.
test('una nota que te comparten dice de quién es', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);
	await page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const abrir = indexedDB.open('copynotes');
				abrir.onerror = () => reject(abrir.error);
				abrir.onsuccess = () => {
					const tx = abrir.result.transaction(['notes', 'shareMembers'], 'readwrite');
					tx.objectStore('notes').getAll().onsuccess = (evento) => {
						const nota = evento.target.result[0];
						tx.objectStore('shareMembers').put({ id: `owner:${nota.id}`, name: 'Hernán' });
					};
					tx.oncomplete = () => resolve(null);
					tx.onerror = () => reject(tx.error);
				};
			})
	);

	// La etiqueta del botón cambia con el estado a propósito (spec 016: el color
	// solo nunca alcanza), así que una nota compartida NO se busca por "Compartir
	// nota".
	await page.getByRole('button', { name: /^Nota compartida/ }).first().click();

	await expect(page.getByText(/te la comparte/i)).toContainText('Hernán');
	await expect(page.getByRole('button', { name: 'Salirme de esta nota' })).toBeVisible();
});

// El título es un `<input>` aparte, no un renglón, así que no lo tapa nada de lo
// de arriba: `readOnly` sólo bajaba hasta `BlockRow`. Sin esto el invitado podía
// renombrar la nota del otro (encontrado en el gate manual, 2026-08-17).
test('en una nota que te comparten el título no se puede cambiar', async ({ page }) => {
	await openApp(page);
	const titulo = page.getByRole('textbox', { name: 'Título de la nota' });
	await expect(titulo).not.toHaveAttribute('readonly', /.*/);

	await marcarComoAjena(page);

	await expect(titulo).toHaveAttribute('readonly', /.*/);
});

// La barra de formato aparecía al marcar texto y sus botones no hacían nada
// (`runFormatCommand` ya los rechazaba). Una barra que promete y no cumple es
// peor que ninguna barra. Marcar y copiar tienen que seguir andando: lo único
// que se va es la barra.
test('en una nota que te comparten no aparece la barra de formato', async ({ page }) => {
	await openApp(page);
	const barra = page.locator('[data-copynotes-toolbar]');
	const renglon = page.locator('main [data-block-surface]').first();

	await renglon.selectText();
	await expect(barra).toBeVisible();

	await marcarComoAjena(page);

	await page.locator('main [data-block-surface]').first().selectText();
	// La espera NO es de más y no se saca: la barra tarda 300ms a propósito (para
	// no parpadear mientras se arrastra la selección), así que un `toHaveCount(0)`
	// pegado al `selectText` da verde con el candado puesto Y sin poner. Se midió:
	// esta prueba pasaba sin el arreglo. Un plazo es lo correcto para probar que
	// algo NO aparece cuando se sabe cuánto tarda en aparecer.
	await page.waitForTimeout(700);
	await expect(barra).toHaveCount(0);
});
