import { test, expect } from '@playwright/test';

// Elegir qué versión queda cuando el mismo renglón cambió en dos dispositivos
// (spec 030 fase 3). La suite corre sin proyecto Supabase, así que el conflicto
// se siembra directo en la base local: es exactamente lo que deja la bajada
// cuando encuentra un choque, y permite probar toda la pantalla sin un segundo
// dispositivo.

// Deja un conflicto sobre un renglón concreto (el id se toma del DOM, para que
// la prueba mire exactamente la misma línea que sembró).
function seedConflict(page, blockId, remoteText) {
	return page.evaluate(
		([id, text]) =>
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
							remote: { ...block, content: text, html: text },
							at: new Date().toISOString()
						});
						write.transaction.oncomplete = () => resolve(block.id);
						write.transaction.onerror = () => reject(new Error('no se pudo sembrar'));
					};
				};
			}),
		[blockId, remoteText]
	);
}

// El id del primer renglón visible: es el que la prueba después inspecciona.
async function firstBlockId(page) {
	return page.locator('main [data-block-id]').first().getAttribute('data-block-id');
}

test('el renglón avisa que hay otra versión y deja elegir cuál queda', async ({ page }) => {
	await page.goto('/');
	await page.locator('main [data-block-id] .block-editable').first().waitFor();

	await seedConflict(page, await firstBlockId(page), 'lo que escribí en la otra computadora');
	// Los conflictos se leen al abrir la nota.
	await page.reload();

	const aviso = page.getByRole('button', { name: 'Hay otra versión de este renglón' });
	await expect(aviso).toBeVisible();

	await aviso.click();
	await expect(page.getByText('lo que escribí en la otra computadora')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Quedarme con el mío' })).toBeVisible();

	await page.getByRole('button', { name: 'Traer el otro' }).click();

	// La versión elegida reemplaza al renglón y el aviso desaparece.
	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(
		'lo que escribí en la otra computadora'
	);
	await expect(aviso).toHaveCount(0);
});

test('quedarse con lo propio deja el renglón como estaba y saca el aviso', async ({ page }) => {
	await page.goto('/');
	const primero = page.locator('main [data-block-id] .block-editable').first();
	await primero.waitFor();
	const mio = await primero.textContent();

	await seedConflict(page, await firstBlockId(page), 'la versión del otro dispositivo');
	await page.reload();

	await page.getByRole('button', { name: 'Hay otra versión de este renglón' }).click();
	await page.getByRole('button', { name: 'Quedarme con el mío' }).click();

	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(mio ?? '');
	await expect(
		page.getByRole('button', { name: 'Hay otra versión de este renglón' })
	).toHaveCount(0);
});
