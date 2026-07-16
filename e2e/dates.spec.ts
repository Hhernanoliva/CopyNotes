import { test, expect } from '@playwright/test';

// Spec 021 Slice A: /fecha puts a badge on the line and it survives reload.

test('slash date assigns a persistent badge', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	await page.getByRole('option', { name: 'Fecha' }).click();

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();

	const badge = page.getByRole('button', { name: 'Cambiar fecha' });
	await expect(badge).toHaveText(/hoy/);

	await page.waitForTimeout(700); // let autosave flush before reload
	await page.reload();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/hoy/);

	await page.getByRole('button', { name: 'Cambiar fecha' }).click();
	await page.getByRole('button', { name: 'Quitar fecha' }).click();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveCount(0);
});
