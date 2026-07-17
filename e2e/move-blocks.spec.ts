import { test, expect } from '@playwright/test';

// Alt+Arrow moves a line among its siblings; at the parent's edge it now
// escapes the parent (fix: it used to stop there), landing at the parent's
// level. The note's top/bottom is still the hard limit.

const blockTexts = (page) =>
	page.$$eval('main [data-block-id] .block-editable', (els) =>
		els.map((el) => el.textContent ?? '')
	);

test('Alt+Arrow moves a line out of its parent in both directions', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	// Build: Padre > [Hijo 1, Hijo 2]
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Padre');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // focus lands on the new block asynchronously
	await page.keyboard.type('Hijo 1');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(150); // indenting re-focuses the row
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 2');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2']);

	// Down at the parent's edge: Hijo 2 escapes below Padre, at root level.
	await page.keyboard.press('Alt+ArrowDown');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2']);
	const hijo2Row = page.locator('main [data-block-id]', { hasText: 'Hijo 2' });
	await expect(hijo2Row).toHaveCSS('padding-left', '0px');

	// Up at the parent's edge: Hijo 1 escapes above Padre.
	await page.getByText('Hijo 1', { exact: true }).click();
	await page.keyboard.press('Alt+ArrowUp');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Padre', 'Hijo 2']);
	const hijo1Row = page.locator('main [data-block-id]', { hasText: 'Hijo 1' });
	await expect(hijo1Row).toHaveCSS('padding-left', '0px');

	// Top of the note is still the limit: nothing changes.
	await page.keyboard.press('Alt+ArrowUp');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Padre', 'Hijo 2']);

	// The new structure survives a reload.
	await page.waitForTimeout(700); // let autosave flush
	await page.reload();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Padre', 'Hijo 2']);
});
