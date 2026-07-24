import { test, expect } from '@playwright/test';

test('Settings shows an Agentes section', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Configuración' }).click();
	await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible();
	// With no activity yet, the empty-state copy shows.
	await expect(page.getByText('Todavía no hay actividad de agentes.')).toBeVisible();
});
