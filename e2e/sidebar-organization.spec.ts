import { test, expect } from '@playwright/test';

// Spec 022: sidebar organization. Slice A: click a snippet's name to rename it.

async function readJsonDownload(download) {
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('click on a snippet name renames it and the name survives a reload', async ({ page }) => {
	await page.goto('/');
	// Seed a snippet through the + dialog (name auto-derives from the text).
	await page.getByRole('button', { name: 'Snippets' }).click();
	await page.getByRole('button', { name: 'Nuevo snippet' }).click();
	await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('Hola, gracias por escribirnos');
	await page.getByRole('button', { name: 'Guardar snippet' }).click();
	await expect(page.getByText('Snippet guardado')).toBeVisible();

	// Click the name → inline input appears pre-filled.
	await page
		.getByRole('button', { name: 'Renombrar snippet Hola, gracias por escribirnos' })
		.click();
	const input = page.getByLabel('Nuevo nombre del snippet');
	await expect(input).toBeVisible();
	await input.fill('Bienvenida');
	await input.press('Enter');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Exportar snippets' }).click()
	]);
	const exported = await readJsonDownload(download);
	expect(exported.snippets.map((snippet) => snippet.name)).toContain('Bienvenida');
	expect(exported.snippets.map((snippet) => snippet.name)).not.toContain(
		'Hola, gracias por escribirnos'
	);
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();

	// Escape cancels without saving.
	await page.getByRole('button', { name: 'Renombrar snippet Bienvenida' }).click();
	await page.getByLabel('Nuevo nombre del snippet').fill('Otro nombre');
	await page.getByLabel('Nuevo nombre del snippet').press('Escape');
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Snippets' }).click();
	await expect(page.getByText('Bienvenida', { exact: true })).toBeVisible();
});

// Slice B: manual order via drag & drop.

async function dragRowTo(page, source, target, offsetY = 0) {
	const src = await source.boundingBox();
	const dst = await target.boundingBox();
	await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
	await page.mouse.down();
	// pass the 5px threshold first, then travel in steps
	await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + 8, { steps: 2 });
	await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2 + offsetY, { steps: 8 });
	await page.mouse.up();
}

test('notes can be dragged into a manual order that survives reload', async ({ page }) => {
	await page.goto('/');
	// Three notes; each new note lands on top → visual order: C, B, A.
	for (const title of ['Nota A', 'Nota B', 'Nota C']) {
		await page.getByRole('button', { name: 'Nueva nota' }).click();
		await page.getByRole('textbox', { name: 'Título de la nota' }).fill(title);
		await page.waitForTimeout(700); // title autosave
	}
	const list = page.getByRole('navigation', { name: 'Lista de notas' });
	// A seeded demo note also sits in the list; match only the notes we made.
	// The delete button shares the title in its aria-label, so anchor the name.
	const myNotes = () =>
		page.getByRole('navigation', { name: 'Lista de notas' }).getByRole('button', {
			name: /^Nota [ABC]$/
		});
	await expect(myNotes()).toHaveText(['Nota C', 'Nota B', 'Nota A']);

	// Drag A above C (to the very top).
	await dragRowTo(
		page,
		list.getByRole('button', { name: 'Nota A', exact: true }),
		list.getByRole('button', { name: 'Nota C', exact: true }),
		-6
	);
	await expect(myNotes()).toHaveText(['Nota A', 'Nota C', 'Nota B']);
	// Dragging must not leave the row texts selected (text-selection suppressed
	// while a drag is live).
	expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

	await page.reload();
	await expect(myNotes()).toHaveText(['Nota A', 'Nota C', 'Nota B']);
});

// Slice C: folders — file a snippet by dragging, collapse persists, delete restores.

test('folders: file a snippet by dragging, collapse persists, delete restores contents', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Snippets' }).click();
	for (const text of ['Alfa', 'Beta']) {
		await page.getByRole('button', { name: 'Nuevo snippet' }).click();
		await page.getByRole('textbox', { name: 'Texto', exact: true }).fill(text);
		await page.getByRole('button', { name: 'Guardar snippet' }).click();
		await expect(page.getByText('Snippet guardado')).toBeVisible();
	}
	// Create a folder with the dedicated folder button; it opens in rename mode.
	await page.getByRole('button', { name: 'Nueva carpeta de snippets' }).click();
	const folderInput = page.getByLabel('Nuevo nombre de la carpeta');
	await folderInput.fill('Clientes');
	await folderInput.press('Enter');
	await expect(page.getByRole('button', { name: 'Renombrar carpeta Clientes' })).toBeVisible();

	// Drag "Beta" onto the folder row (its middle band files it inside).
	const library = page.getByRole('region', { name: 'Biblioteca de snippets' });
	await dragRowTo(
		page,
		library.getByRole('button', { name: 'Renombrar snippet Beta' }),
		page.getByRole('button', { name: 'Renombrar carpeta Clientes' })
	);
	await expect(page.getByRole('button', { name: 'Renombrar carpeta Clientes' })).toContainText('(1)');

	// Collapse; Beta hides; reload keeps it collapsed.
	await page.getByRole('button', { name: 'Cerrar carpeta Clientes' }).click();
	await expect(library.getByRole('button', { name: 'Renombrar snippet Beta' })).toBeHidden();
	await page.reload();
	await page.getByRole('button', { name: 'Snippets' }).click();
	await expect(page.getByRole('button', { name: 'Abrir carpeta Clientes' })).toBeVisible();

	// Delete the folder: Beta returns to the root list.
	await page.getByRole('button', { name: 'Borrar carpeta Clientes' }).click();
	await expect(page.getByText('Carpeta borrada; su contenido volvió a la lista')).toBeVisible();
	await expect(library.getByRole('button', { name: 'Renombrar snippet Beta' })).toBeVisible();
});

test('backup roundtrip keeps folders and membership', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Snippets' }).click();
	for (const text of ['Alfa', 'Beta']) {
		await page.getByRole('button', { name: 'Nuevo snippet' }).click();
		await page.getByRole('textbox', { name: 'Texto', exact: true }).fill(text);
		await page.getByRole('button', { name: 'Guardar snippet' }).click();
		await expect(page.getByText('Snippet guardado')).toBeVisible();
	}
	await page.getByRole('button', { name: 'Nueva carpeta de snippets' }).click();
	const folderInput = page.getByLabel('Nuevo nombre de la carpeta');
	await folderInput.fill('Clientes');
	await folderInput.press('Enter');

	const library = page.getByRole('region', { name: 'Biblioteca de snippets' });
	await dragRowTo(
		page,
		library.getByRole('button', { name: 'Renombrar snippet Beta' }),
		page.getByRole('button', { name: 'Renombrar carpeta Clientes' })
	);
	await expect(page.getByRole('button', { name: 'Renombrar carpeta Clientes' })).toContainText('(1)');

	// Export the current state to a file.
	await page.getByRole('button', { name: 'Respaldo' }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: /Descargar respaldo completo/ }).click()
	]);
	const path = await download.path();

	// Replace everything from that file: a full wipe + restore proves the
	// folders and membership survived the JSON roundtrip.
	const [fileChooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page.getByRole('button', { name: 'Elegir archivo de respaldo…' }).click()
	]);
	await fileChooser.setFiles(path);
	await page.getByRole('button', { name: 'Reemplazar todo…' }).click();
	await page.getByRole('button', { name: 'Sí, borrar lo actual y reemplazar' }).click();
	await expect(page.getByText('Respaldo restaurado desde cero.')).toBeVisible();

	await page.getByRole('button', { name: 'Snippets', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Renombrar carpeta Clientes' })).toContainText('(1)');
	await expect(library.getByRole('button', { name: 'Renombrar snippet Beta' })).toBeVisible();
	await expect(library.getByRole('button', { name: 'Renombrar snippet Alfa' })).toBeVisible();
});
