import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Elegir qué versión queda cuando el mismo renglón cambió en dos dispositivos
// (spec 030 fase 3). La suite corre sin proyecto Supabase, así que el conflicto
// se siembra directo en la base local: es exactamente lo que deja la bajada
// cuando encuentra un choque, y permite probar toda la pantalla sin un segundo
// dispositivo.

// Deja un conflicto sobre un renglón concreto (el id se toma del DOM, para que
// la prueba mire exactamente la misma línea que sembró).
function seedConflict(page, blockId, remote) {
	return page.evaluate(
		([id, patch]) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(new Error('no abrió la base'));
				open.onsuccess = () => {
					const db = open.result;
					const read = db.transaction('blocks', 'readonly').objectStore('blocks').get(id);
					read.onsuccess = () => {
						const block = read.result;
						if (!block) return reject(new Error('ese renglón no existe'));
						const write = db.transaction('conflicts', 'readwrite').objectStore('conflicts');
						write.put({
							id: `blocks:${block.id}`,
							table: 'blocks',
							recordId: block.id,
							remote: { ...block, ...patch },
							at: new Date().toISOString()
						});
						write.transaction.oncomplete = () => resolve(block.id);
						write.transaction.onerror = () => reject(new Error('no se pudo sembrar'));
					};
				};
			}),
		[blockId, remote]
	);
}

// El id del primer renglón visible: es el que la prueba después inspecciona.
async function firstBlockId(page) {
	return page.locator('main [data-block-id]').first().getAttribute('data-block-id');
}

const mine = () => 'Quedarme con esta versión, la de este dispositivo';
const theirs = () => 'Traer esta versión, la del otro dispositivo';

async function seedAndReload(page, patch) {
	await openApp(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.waitFor();
	const before = await first.textContent();
	await seedConflict(page, await firstBlockId(page), patch);
	// Los conflictos se leen al abrir la nota.
	await page.reload();
	await first.waitFor();
	return before ?? '';
}

test('las dos versiones se muestran solas y se elige tocando una', async ({ page }) => {
	// Sin paso de "abrir": un choque es raro e importante, y esconderlo detrás de
	// un enlace lo vuelve fácil de ignorar.
	await seedAndReload(page, {
		content: 'lo que escribí en la otra computadora',
		html: 'lo que escribí en la otra computadora'
	});

	await expect(page.getByText('Otra versión de este renglón')).toBeVisible();
	const traer = page.getByRole('button', { name: theirs() });
	await expect(traer).toBeVisible();
	await expect(page.getByRole('button', { name: mine() })).toBeVisible();
	// Los botones de antes ya no existen: la versión ES la elección.
	await expect(page.getByRole('button', { name: 'Quedarme con el mío' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Traer el otro' })).toHaveCount(0);

	await traer.click();

	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(
		'lo que escribí en la otra computadora'
	);
	await expect(page.getByRole('button', { name: theirs() })).toHaveCount(0);
});

test('lo que cambió entre las dos versiones queda marcado', async ({ page }) => {
	// El caso real que motivó esto: dos renglones casi idénticos son un juego de
	// buscar las diferencias, y hasta que no la encontrás no podés elegir.
	//
	// La versión de allá se deriva del renglón que haya: cambia UNA palabra, la
	// primera, y la prueba no depende de qué diga la nota de ejemplo.
	await openApp(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.waitFor();
	const mio = (await first.textContent()) ?? '';
	const palabra = mio.trim().split(/\s+/)[0];
	const suyo = mio.replace(palabra, `${palabra}X`);

	await seedConflict(page, await firstBlockId(page), { content: suyo, html: suyo });
	await page.reload();

	// Una marca por versión, cada una sobre la palabra entera: subrayar una sola
	// letra no se ve, y ver la palabra completa es lo que hace legible el cambio.
	const marcas = page.locator('.cn-diff');
	await expect(marcas).toHaveCount(2);
	await expect(marcas.nth(0)).toHaveText(palabra);
	await expect(marcas.nth(1)).toHaveText(`${palabra}X`);
});

test('elegir se puede deshacer desde el aviso', async ({ page }) => {
	// Decidir cuesta un toque, así que volver también: el aviso con "Deshacer" es
	// lo que reemplaza al segundo clic que antes hacía de red.
	const mio = await seedAndReload(page, {
		content: 'la versión del otro dispositivo',
		html: 'la versión del otro dispositivo'
	});

	await page.getByRole('button', { name: theirs() }).click();
	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(
		'la versión del otro dispositivo'
	);

	await page.getByRole('button', { name: 'Deshacer' }).click();

	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(mio);
	// Y el choque vuelve a estar abierto, esperando otra decisión.
	await expect(page.getByRole('button', { name: theirs() })).toBeVisible();
});

test('quedarse con lo propio deja el renglón como estaba y saca el aviso', async ({ page }) => {
	const mio = await seedAndReload(page, {
		content: 'la versión del otro dispositivo',
		html: 'la versión del otro dispositivo'
	});

	await page.getByRole('button', { name: mine() }).click();

	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(mio);
	await expect(page.getByRole('button', { name: mine() })).toHaveCount(0);
});

test('un borrado del otro dispositivo se ofrece como borrado, no como texto', async ({ page }) => {
	// No es "quedate con este texto" sino "borrá el renglón", y tiene que
	// distinguirse para no elegirlo por error.
	await seedAndReload(page, { deletedAt: '2026-08-02T12:00:00.000Z' });

	const borrar = page.getByRole('button', {
		name: 'Borrar este renglón, como se borró en el otro dispositivo'
	});
	await expect(borrar).toBeVisible();
	await expect(borrar).toContainText('Borrar este renglón');
});
