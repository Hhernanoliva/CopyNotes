import { test, expect } from '@playwright/test';
import { openApp } from './app';

test('Settings shows an Agentes section', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Configuración' }).click();
	await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible();
	// With no activity yet, the empty-state copy shows.
	await expect(page.getByText('Todavía no hay actividad de agentes.')).toBeVisible();
});
