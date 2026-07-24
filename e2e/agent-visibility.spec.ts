import { test, expect } from '@playwright/test';

test('note header exposes an agent-visibility toggle that persists', async ({ page }) => {
	await page.goto('/');
	// Create a note (adjust selector to your suite's helper if one exists).
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const toggle = page.getByRole('button', { name: 'Visible para agentes' });
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	// Survives a reload (persisted through updateNote).
	await page.reload();
	await expect(page.getByRole('button', { name: 'Visible para agentes' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
