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
async function marcarComoAjena(page, rol = 'member') {
	await page.evaluate(
		(rol) =>
			new Promise((resolve, reject) => {
				const abrir = indexedDB.open('copynotes');
				abrir.onerror = () => reject(abrir.error);
				abrir.onsuccess = () => {
					const tx = abrir.result.transaction('notes', 'readwrite');
					const store = tx.objectStore('notes');
					store.getAll().onsuccess = (evento) => {
						const nota = evento.target.result[0];
						store.put({ ...nota, share: rol });
					};
					tx.oncomplete = () => resolve(null);
					tx.onerror = () => reject(tx.error);
				};
			}),
		rol
	);
	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
}

async function bloquesPersistidos(page) {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const abrir = indexedDB.open('copynotes');
				abrir.onerror = () => reject(abrir.error);
				abrir.onsuccess = () => {
					const tx = abrir.result.transaction('blocks', 'readonly');
					tx.objectStore('blocks').getAll().onsuccess = (evento) =>
						resolve(
							evento.target.result
								.map((row) => ({
									id: row.id,
									content: row.content,
									html: row.html,
									type: row.type,
									parentBlockId: row.parentBlockId,
									order: row.order,
									deletedAt: row.deletedAt
								}))
								.sort((a, b) => a.id.localeCompare(b.id))
						);
				};
			})
	);
}

test('una nota que te comparten no se puede escribir', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	await expect(page.locator('main [data-block-surface]').first()).toHaveAttribute(
		'contenteditable',
		'false'
	);
});

test('en sólo lectura un enlace abre directo y Ctrl/Cmd+K busca', async ({ page }) => {
	await openApp(page);
	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.selectText();
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Enlace', exact: true }).click();
	await page.getByLabel('URL del enlace').fill('https://ejemplo.com/compartida');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(700);
	await marcarComoAjena(page);

	const readOnlyLine = page.locator('main [data-block-id] .block-editable').first();
	const anchor = readOnlyLine.locator('a').first();
	const [popup] = await Promise.all([page.waitForEvent('popup'), anchor.click()]);
	expect(popup.url()).toContain('ejemplo.com/compartida');
	await popup.close();
	await expect(page.getByRole('dialog', { name: 'Acciones del enlace' })).toHaveCount(0);

	await readOnlyLine.focus();
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.locator('dialog[aria-label="Buscar"]')).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Acciones del enlace' })).toHaveCount(0);
});

test('la selección en sólo lectura copia pero teclas y arrastres no escriben', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);
	const before = await bloquesPersistidos(page);
	const rows = page.locator('main [data-block-id]');
	const first = rows.first().locator('[data-block-surface]').first();

	await expect(page.getByRole('button', { name: 'Seleccionar o arrastrar renglón' })).toHaveCount(0);
	await first.focus();
	await page.keyboard.press('Escape');
	await expect(page.getByText('1 renglón seleccionado')).toBeAttached();
	await page.keyboard.press('ControlOrMeta+c');
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.not.toBe('');

	await page.keyboard.press('Shift+ArrowDown');
	await expect(page.getByText('2 renglones seleccionados')).toBeAttached();
	for (const key of [
		'/',
		'Delete',
		'Tab',
		'Alt+ArrowDown',
		'ControlOrMeta+z',
		'ControlOrMeta+y',
		'ControlOrMeta+Shift+z'
	]) {
		await page.keyboard.press(key);
	}
	await expect(page.locator('#slash-menu')).toHaveCount(0);

	const firstBox = await rows.first().boundingBox();
	const lastBox = await rows.last().boundingBox();
	await page.mouse.move(firstBox.x + 80, firstBox.y + firstBox.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(450);
	await page.mouse.move(lastBox.x + 80, lastBox.y + lastBox.height / 2, { steps: 8 });
	await page.mouse.up();
	await page.waitForTimeout(800);

	expect(await bloquesPersistidos(page)).toEqual(before);
	await page.keyboard.press('Enter');
	await expect(page.getByText(/renglón seleccionado|renglones seleccionados/)).toHaveCount(0);
});

// Los controles del renglón son `pointer-events-none` hasta que el puntero entra
// en la fila (o algo de adentro toma el foco). Las pruebas de B1 sólo los
// CONTABAN, así que nunca hizo falta; para abrir el menú hay que pasar por
// arriba primero, igual que una persona.
async function abrirMenuDelRenglon(page) {
	await page.locator('main .cn-row').first().hover();
	await page.getByRole('button', { name: 'Más acciones' }).first().click();
}

// El menú del renglón tiene seis puertas y cinco escriben el renglón. Al
// invitado le queda UNA, la de comentar (spec 038 §6, parte B2). Hasta B2 no le
// quedaba ninguna, y el cambio es a propósito: comentar no escribe el renglón,
// deja una línea de bitácora, que es lo único que el servidor le acepta.
//
// El control de la primera mitad NO es decorativo: la primera versión de esta
// prueba buscaba "Acciones del bloque", que es el nombre del menú ABIERTO y no
// del botón que lo abre, así que daba verde con el candado puesto y sin poner.
// Contar los ítems en la nota propia ANTES es lo que impide que vuelva a pasar:
// un menú que no se renderiza por cualquier motivo daría "un solo ítem" también.
// De las siete puertas de este menú, al invitado le quedan DOS: comentar, que es
// lo único que puede escribir (spec 038 §6), y entrar en el renglón, que no
// escribe nada — mirar una rama de cerca no es editarla (spec 043).
//
// Se nombran las cinco que NO pueden estar en vez de sólo contarlas: contar deja
// pasar un cambio que quita una y agrega otra, y acá cada una es una puerta de
// escritura.
test('en una nota que te comparten el menú del renglón queda en dos ítems', async ({
	page
}) => {
	await openApp(page);
	await abrirMenuDelRenglon(page);
	expect(await page.getByRole('menuitem').count()).toBe(7);
	await page.keyboard.press('Escape');

	await marcarComoAjena(page);

	await abrirMenuDelRenglon(page);
	await expect(page.getByRole('menuitem')).toHaveCount(2);
	await expect(page.getByRole('menuitem', { name: /Agregar comentario/ })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: /Entrar acá/ })).toBeVisible();
	for (const prohibida of ['Mover arriba', 'Mover abajo', 'Guardar como snippet', 'Etiquetar', 'Eliminar']) {
		await expect(page.getByRole('menuitem', { name: prohibida })).toHaveCount(0);
	}
});

// Y lo que el invitado escribe ahí aparece bajo la tarea, con su recuadro de
// autor. No es `block.note` —ese campo es del dueño y no viaja— sino una línea
// de bitácora, que se manda entera con Enter y no se puede editar después.
test('el invitado comenta una tarea y su comentario queda debajo', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	await abrirMenuDelRenglon(page);
	await page.getByRole('menuitem', { name: /Agregar comentario/ }).click();
	const campo = page.getByRole('textbox', { name: 'Comentar la tarea' });
	await expect(campo).toHaveAttribute('contenteditable', 'plaintext-only');
	await campo.fill('le dejé mensaje');
	await page.keyboard.press('Enter');

	const comentario = page.locator('main p.agent-note').filter({ hasText: 'le dejé mensaje' });
	await expect(comentario).toBeVisible();
	await expect(comentario.locator('.agent-note-badge')).toBeVisible();
	// Y el campo se vació: es un mensaje que se manda, no un texto que se edita.
	await expect(page.getByRole('textbox', { name: 'Comentar la tarea' })).toHaveCount(0);

	// La afirmación central de todo esto, y la única que se puede medir mirando el
	// disco: NINGÚN renglón quedó escrito. El comentario del dueño (`block.note`)
	// es otro campo, es suyo, y no viaja por el caño compartido — si el invitado lo
	// escribiera, su texto se quedaría en su propia copia y el dueño no lo vería
	// nunca. Guardar al teclear dejaría además una fila por letra.
	const notasDeRenglon = await page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const abrir = indexedDB.open('copynotes');
				abrir.onerror = () => reject(abrir.error);
				abrir.onsuccess = () => {
					const tx = abrir.result.transaction('blocks', 'readonly');
					tx.objectStore('blocks').getAll().onsuccess = (evento) =>
						resolve(evento.target.result.map((fila) => fila.note ?? ''));
				};
			})
	);
	// El control viene de arriba y es real: la nota de demo YA trae un comentario
	// del dueño, así que esta lista no está vacía. Sin eso, un `not.toContain`
	// sobre una lista vacía —o sobre el campo equivocado— daría verde sin probar
	// nada.
	expect(notasDeRenglon.join('\n').length).toBeGreaterThan(0);
	expect(notasDeRenglon.join('\n')).not.toContain('le dejé mensaje');

	// Y sobrevive a cerrar y abrir: quedó guardado, no pintado en pantalla.
	await page.reload();
	await expect(
		page.locator('main p.agent-note').filter({ hasText: 'le dejé mensaje' })
	).toBeVisible();
});

// La casilla es la EXCEPCIÓN al candado, desde spec 038 §5 (parte B2): tildar es
// la forma en que el invitado contesta el ticket. Por dentro no escribe el
// renglón del otro —deja una línea de bitácora, que es lo único que el servidor
// le acepta— y el renglón que se ve tildado de este lado es un cache local.
//
// Esta prueba decía lo contrario hasta B2 (`toBeDisabled`), y el cambio es a
// propósito: no se le abrió una puerta al candado, se construyó la única puerta
// que el candado siempre tuvo que tener.
test('en una nota que te comparten la casilla SÍ se puede tocar', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	const casilla = page.getByRole('checkbox').first();
	await expect(casilla).toBeEnabled();
	await casilla.click();
	await expect(casilla).toHaveAttribute('aria-checked', 'true');
});

// El control de la de arriba, y no es decorativo: sin él, un renglón que dejara
// de ser una tarea —o una siembra que no marcara la nota como ajena— haría pasar
// las dos mitades sin probar nada. Lo que tiene que seguir cerrado, sigue
// cerrado en la MISMA nota donde la casilla se abrió.
test('pero el resto del candado sigue cerrado con la casilla abierta', async ({ page }) => {
	await openApp(page);
	await marcarComoAjena(page);

	await expect(page.getByRole('checkbox').first()).toBeEnabled();
	await expect(page.locator('main [data-block-surface]').first()).toHaveAttribute(
		'contenteditable',
		'false'
	);
	// El menú existe (comentar es la otra excepción), pero mover, borrar,
	// etiquetar y guardar como fragmento no están adentro.
	await abrirMenuDelRenglon(page);
	await expect(page.getByRole('menuitem', { name: /Eliminar|Mover|Etiquetar|fragmento/ })).toHaveCount(
		0
	);
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

// El pie de la nota compartida (spec 038 §8). "Listo" habla de la nota ENTERA,
// no de un renglón: es la forma en que el invitado contesta el pedido.
//
// El botón es SÓLO del invitado, y el registro lo leen los dos. Las tres mitades
// se prueban juntas porque separadas cada una pasa vacíamente: un pie que no se
// renderiza da "el dueño no ve el botón" igual de verde.
test('el botón Listo es del invitado, y lo que declara lo ven los dos', async ({ page }) => {
	await openApp(page);
	// Control 1: una nota que no está compartida no tiene pie de ninguna clase.
	await expect(page.getByRole('button', { name: 'Listo' })).toHaveCount(0);

	await marcarComoAjena(page);

	await expect(page.getByRole('button', { name: 'Listo' })).toBeVisible();
	await page.getByPlaceholder('Algo que aclarar').fill('falta la factura');
	await page.getByRole('button', { name: 'Listo' }).click();
	// Tercera persona, y no es un descuido: el build de e2e no tiene Supabase, así
	// que no hay sesión, la línea se escribe con actor 'user' y desde la silla del
	// INVITADO 'user' es la otra parte. Con sesión real acá dice "Vos marcaste
	// Listo" (medido en el gate del 2026-08-19). **No cambiar a /marcaste Listo/:**
	// se probó y falla, y el que falla es el entorno, no el código.
	await expect(page.getByText(/marcó Listo/)).toBeVisible();
	await expect(page.getByText('falta la factura')).toBeVisible();

	// Control 2: en la nota del DUEÑO la declaración se lee y el botón no está —
	// no tiene a quién avisarle de su propia nota.
	await marcarComoAjena(page, 'owner');

	// Y se lee CONJUGADA AL REVÉS que arriba, sobre la misma línea: desde la silla
	// del dueño, 'user' es él. Ese contraste es lo que vigila que la conjugación
	// salga de `actionLabel(entry, ctx)` y no de una cadena escrita a mano en el
	// pie — con "marcó Listo" fijo, como estaba, una de las dos siempre mentía.
	await expect(page.getByText(/marcaste Listo/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Listo' })).toHaveCount(0);
});
