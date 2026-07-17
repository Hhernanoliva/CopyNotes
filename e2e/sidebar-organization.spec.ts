import { test, expect } from '@playwright/test';

// Spec 022: sidebar organization. Slice A: click a snippet's name to rename it.

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
