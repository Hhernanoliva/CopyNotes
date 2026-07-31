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

// Regression: the caret used to be claimed only after the database writes the
// conversion, so a character typed in that window landed at offset 0 ("!Hola
// mundo"). No waiting in between here on purpose — that IS the test.
test('a character typed right after picking lands where the "/" was', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Hola mundo');
	await page.keyboard.type('/');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.keyboard.type('tarea');

	await page.keyboard.press('Enter');
	await page.keyboard.type('!');

	await expect(first).toHaveText('Hola mundo!');
});

test('Tab picks the highlighted command, same as Enter', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Hola mundo');

	const menu = page.locator('#slash-menu');
	await page.keyboard.type('/tarea');
	await expect(menu).toBeVisible();

	await page.keyboard.press('Tab');
	await expect(menu).toBeHidden();
	await expect(first).toHaveText('Hola mundo');
	await expect(page.locator('main [role="checkbox"]').first()).toBeVisible();
});

test('the "+" button opens the same menu as typing "/"', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeHidden();

	const plusButton = page.getByRole('button', { name: 'Agregar bloque' });
	await expect(plusButton).toBeVisible();
	await plusButton.click();
	await expect(menu).toBeVisible();

	await page.keyboard.type('tarea');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]').first()).toBeVisible();
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

test('the slash menu opens on a line just emptied with Backspace', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	// Deleting every character leaves a browser <br> behind, which the editor
	// used to read as a stray newline and take for "more than one character
	// changed" — the menu then refused to open on the very next keystroke.
	await page.keyboard.type('ab');
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');
	await expect(first).toHaveText('');

	await page.keyboard.type('/');
	await expect(page.locator('#slash-menu')).toBeVisible();
});

// Spec 031: with several rows marked, "/" changes the type of the whole group.
// The pasted-bullets case: three bullets become three tasks in one gesture.
// Keyboard path: the group menu lists text, h1, h2, h3, bullet, todo, code —
// so "Tarea" is five ArrowDowns down from the top.
test('"/" over a selection converts every marked row into a task', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/vineta');
	await page.keyboard.press('Enter');
	await page.keyboard.type('uno');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // focus lands on the new block asynchronously
	await page.keyboard.type('dos');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // focus lands on the new block asynchronously
	await page.keyboard.type('tres');

	// Mark the three rows from the last one upwards.
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('Shift+ArrowUp');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeHidden();
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await expect(menu).toContainText('3 renglones');

	for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(3);

	// The "/" never entered any row's text.
	const rows = page.locator('main [data-block-id] .block-editable');
	await expect(rows.nth(0)).toHaveText('uno');
	await expect(rows.nth(1)).toHaveText('dos');
	await expect(rows.nth(2)).toHaveText('tres');
});

// Mouse path + Escape + undo. Pressing "/" again is the probe for "the
// selection is still marked": the group menu only opens with 2+ rows selected.
test('picking with the mouse keeps the selection, and one Ctrl+Z undoes the group', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('uno');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // focus lands on the new block asynchronously
	await page.keyboard.type('dos');
	await page.keyboard.press('Shift+ArrowUp');

	const menu = page.locator('#slash-menu');
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(0);

	// The selection survived Escape: the group menu opens again.
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.getByRole('option', { name: 'Tarea' }).click();
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(2);

	// …and it also survived the click on the menu option.
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');

	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(0);
});
