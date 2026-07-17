import { test, expect } from '@playwright/test';

// Slash menu anywhere in the block (fix: the menu only opened when "/" was
// the first character). After picking a command the typed text survives and
// the caret returns to where the "/" was.

test('the slash menu opens after typed text and the caret returns to the "/" position', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Hola mundo');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeHidden();
	await page.keyboard.type('/');
	await expect(menu).toBeVisible();

	// Filter down to "Tarea" and pick it: the text stays, the block converts.
	await page.keyboard.type('tarea');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(first).toHaveText('Hola mundo');
	await expect(page.locator('main [role="checkbox"]').first()).toBeVisible();

	// The caret went back to where the "/" was (end of "Hola mundo").
	await page.keyboard.type('!');
	await expect(first).toHaveText('Hola mundo!');
});

test('the slash menu works mid-text and strips only the "/query" span', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Hola mundo');
	for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');

	await page.keyboard.type('/');
	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	await page.keyboard.type('h2');
	await page.keyboard.press('Enter');

	await expect(menu).toBeHidden();
	await expect(first).toHaveText('Hola mundo');
	await expect(first).toHaveClass(/block-editable--h2/);

	// The caret sits where the "/" was: right between "Hola " and "mundo".
	await page.keyboard.type('X');
	await expect(first).toHaveText('Hola Xmundo');
});

test('Escape keeps the typed "/" as normal text and further typing does not reopen', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Precio 24');

	await page.keyboard.type('/');
	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();

	await page.keyboard.type('7');
	await expect(menu).toBeHidden();
	await expect(first).toHaveText('Precio 24/7');
});
