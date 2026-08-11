import { test, expect } from '@playwright/test';
import { openApp } from './app';

// El punto del header dejó de ser sólo el guardado: es el estado de tus datos, y
// es donde aparecen las versiones que esperan una decisión. Antes ese número
// vivía dentro de Configuración, así que había que sospechar que estaba ahí.
//
// La suite corre sin proyecto Supabase: el conflicto se siembra en la base local,
// que es exactamente lo que deja la bajada cuando encuentra un choque.
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

const statusDot = (page) => page.getByRole('button', { name: /Ver estado/ });
const panel = (page) => page.getByRole('dialog', { name: 'Estado de tus datos' });

test('el punto abre el estado y dice cuando no hay nada pendiente', async ({ page }) => {
	await openApp(page);
	await page.locator('main [data-block-id] .block-editable').first().waitFor();

	await statusDot(page).click();

	await expect(panel(page)).toContainText('Todo al día.');
	// Sin proyecto Supabase, el panel lo dice en vez de fingir una nube.
	await expect(panel(page)).toContainText('Sólo en este dispositivo');

	await page.keyboard.press('Escape');
	await expect(panel(page)).toBeHidden();
	await expect(statusDot(page)).toBeFocused();
});

test('una versión en conflicto se cuenta en el punto y se decide desde ahí', async ({ page }) => {
	await openApp(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.waitFor();
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedConflict(page, blockId, { content: 'lo del otro aparato', html: 'lo del otro aparato' });
	await page.reload();
	await first.waitFor();

	// El número está en el header, sin abrir nada: es todo el punto del cambio.
	await expect(statusDot(page)).toContainText('1');

	await statusDot(page).click();
	await expect(panel(page)).toContainText('lo del otro aparato');
	// Y dice en qué nota está, que es lo que un contador suelto nunca contestó.
	await expect(panel(page)).toContainText('En "');

	// Las versiones son la elección: un solo toque, sin botón aparte.
	await panel(page)
		.getByRole('button', { name: 'Quedarme con esta versión, la de este dispositivo' })
		.click();

	// Y sin nada más que decidir, el panel deja de tapar la nota.
	await expect(panel(page)).toBeHidden();
	await expect(statusDot(page)).not.toContainText('1');
});

test('todo lo de una misma nota se decide de una vez', async ({ page }) => {
	// Borrar una nota tocada en los dos aparatos deja un conflicto POR RENGLÓN.
	// Servidos de a uno son 59 decisiones idénticas; agrupados son una.
	await openApp(page);
	await page.locator('main [data-block-id] .block-editable').first().waitFor();
	const ids = await page.locator('main [data-block-id]').evaluateAll((rows) =>
		rows.slice(0, 3).map((row) => row.getAttribute('data-block-id'))
	);
	for (const id of ids) await seedConflict(page, id, { content: `versión de allá ${id}` });
	await page.reload();
	await page.locator('main [data-block-id] .block-editable').first().waitFor();

	await expect(statusDot(page)).toContainText('3');
	await statusDot(page).click();
	// Una sola cabecera para los tres, y dice cuántos son.
	await expect(panel(page)).toContainText('3 renglones');

	// Los renglones sueltos existen, pero cerrados: abiertos tapan las otras notas.
	await expect(
		panel(page).getByRole('button', { name: 'Quedarme con esta versión, la de este dispositivo' })
	).toBeHidden();
	await panel(page).getByText('Revisar renglón por renglón').click();
	await expect(
		panel(page).getByRole('button', { name: 'Quedarme con esta versión, la de este dispositivo' })
	).toHaveCount(3);

	// Un toque cierra los tres.
	await panel(page).getByRole('button', { name: 'Quedarme con lo de este dispositivo' }).click();
	await expect(panel(page)).toBeHidden();
	await expect(statusDot(page)).not.toContainText('3');
});

test('no ofrece ir a un renglón que acá ya no existe', async ({ page }) => {
	// El enlace se ofrecía siempre. Con el renglón borrado acá no hay adónde ir:
	// se tocaba y no pasaba nada.
	await openApp(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.waitFor();
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedConflict(page, blockId, { content: 'lo del otro aparato' });
	// Y después se borra acá, que es lo que deja una nota borrada en este aparato.
	await page.evaluate(
		(id) =>
			new Promise((resolve) => {
				const open = indexedDB.open('copynotes');
				open.onsuccess = () => {
					const store = open.result.transaction('blocks', 'readwrite').objectStore('blocks');
					const read = store.get(id);
					read.onsuccess = () => {
						store.put({ ...read.result, deletedAt: new Date().toISOString() });
					};
					store.transaction.oncomplete = () => resolve();
				};
			}),
		blockId
	);
	await page.reload();
	await first.waitFor();

	await statusDot(page).click();
	await expect(panel(page)).toContainText('(borrado en este dispositivo)');
	await expect(panel(page).getByRole('button', { name: 'Ir al renglón' })).toBeHidden();
});

test('la nota afectada queda marcada en la lista', async ({ page }) => {
	await openApp(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.waitFor();
	const blockId = await page.locator('main [data-block-id]').first().getAttribute('data-block-id');
	await seedConflict(page, blockId, { content: 'lo del otro aparato' });
	await page.reload();
	await first.waitFor();

	const marca = page.getByRole('img', { name: 'Esta nota tiene una versión sin decidir' });
	await expect(marca).toBeVisible();

	// Y se apaga sola en cuanto se decide: la marca sigue al dato, no a la vista.
	await statusDot(page).click();
	await panel(page)
		.getByRole('button', { name: 'Quedarme con esta versión, la de este dispositivo' })
		.click();
	await expect(marca).toBeHidden();
});
