import { test, expect } from '@playwright/test';

async function readJsonDownload(download) {
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('la ventana de Respaldo no abre con la X enfocada', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Respaldo' }).click();
	await expect(page.getByRole('dialog', { name: 'Respaldo' })).toBeVisible();

	// showModal() enfocaría la X (primer tabbable), que se ve como pre-apretada.
	// El foco debe caer en el título, no en el botón Cerrar.
	const closeFocused = await page
		.getByRole('button', { name: 'Cerrar' })
		.evaluate((el) => el === document.activeElement);
	expect(closeFocused).toBe(false);
});

test('an immediate backup includes the latest editor text', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const title = page.getByLabel('Título de la nota');
	const block = page.locator('main [data-block-id] .block-editable').first();
	await expect(block).toBeVisible();
	await title.fill('Preparación Mac');
	await block.fill('Estas son las últimas palabras');

	// Intentionally do not wait for the editor's 500 ms delayed save.
	await page.getByRole('button', { name: 'Respaldo' }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: /Descargar respaldo completo/ }).click()
	]);
	const backup = await readJsonDownload(download);
	const note = backup.data.notes.find((row) => row.title === 'Preparación Mac');

	expect(note).toBeTruthy();
	expect(
		backup.data.blocks.some(
			(row) => row.noteId === note.id && row.content === 'Estas son las últimas palabras'
		)
	).toBe(true);
	expect(backup.exportedBy.source).toBe('pwa');
});
