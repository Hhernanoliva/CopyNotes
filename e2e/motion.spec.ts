import { test, expect } from '@playwright/test';

// Quiet Motion guards (spec 024). The animation helper itself is unit-tested in
// src/lib/motion.test.ts; these cover the behaviours the spec promised at the
// interaction level: focus returns to the trigger when a dialog closes, rapid
// open/close does not wedge a panel, and everything still works with the OS
// asking to reduce motion.

const settingsButton = (page) => page.getByRole('button', { name: 'Configuración' });
const settingsHeading = (page) => page.getByRole('heading', { name: 'Configuración' });

test('focus returns to the trigger after a dialog closes', async ({ page }) => {
	await page.goto('/');
	const trigger = settingsButton(page);
	await trigger.click();
	await expect(settingsHeading(page)).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(settingsHeading(page)).toBeHidden();
	// The user lands back on the control they opened it from, not on <body>.
	await expect(trigger).toBeFocused();
});

test('rapidly opening and closing a panel leaves it usable', async ({ page }) => {
	await page.goto('/');
	const trigger = settingsButton(page);

	// Two fast open→close cycles must not leave the dialog stuck open or dead.
	await trigger.click();
	await page.keyboard.press('Escape');
	await trigger.click();
	await page.keyboard.press('Escape');
	await expect(settingsHeading(page)).toBeHidden();

	// Still fully functional afterwards.
	await trigger.click();
	await expect(settingsHeading(page)).toBeVisible();
	await page.getByRole('button', { name: 'Agrandar texto' }).click();
	await expect(page.getByText('110%')).toBeVisible();
});

test.describe('with reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('a dialog still opens, works and returns focus with no animation', async ({ page }) => {
		await page.goto('/');
		const trigger = settingsButton(page);
		await trigger.click();
		await expect(settingsHeading(page)).toBeVisible();
		await page.getByRole('button', { name: 'Agrandar texto' }).click();
		await expect(page.getByText('110%')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(settingsHeading(page)).toBeHidden();
		await expect(trigger).toBeFocused();
	});
});
