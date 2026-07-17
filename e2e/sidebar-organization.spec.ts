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
