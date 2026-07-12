import { test, expect } from '@playwright/test';

// Inline formatting flows (task 16): toolbar visibility, bold persistence,
// heading conversion persistence, and a copy-button regression guard. Each
// test starts a fresh note via "Nueva nota" so the block list is predictable
// (a single empty text block) rather than depending on the seeded demo note.

const title = (page) => page.getByLabel('Título de la nota');

async function selectAllInBlock(page, editable) {
	await editable.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	});
}

test('selecting text shows the formatting toolbar', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: toolbar');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('seleccioname', { delay: 25 });
	await selectAllInBlock(page, first);

	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
});

test('applying bold wraps the text in <strong> and survives a reload', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: negrita');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('hola mundo', { delay: 25 });
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('hola mundo');
	await page.waitForTimeout(700); // let autosave flush

	await page.reload();
	await expect(title(page)).toHaveValue('Formato E2E: negrita');
	await expect(page.locator('main [role="textbox"] strong').first()).toHaveText('hola mundo');
});

test('converting to H2 changes the block and survives a reload without adding an empty block', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: encabezado');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Titulo de seccion', { delay: 25 });
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	const blocksBefore = await page.locator('main [role="textbox"]').count();

	await page.getByRole('button', { name: 'Título 2' }).click();
	await expect(first).toHaveClass(/block-editable--h2/);
	await expect(first).toHaveText('Titulo de seccion');

	const blocksAfter = await page.locator('main [role="textbox"]').count();
	expect(blocksAfter).toBe(blocksBefore);

	await page.waitForTimeout(700); // let autosave flush
	await page.reload();

	await expect(title(page)).toHaveValue('Formato E2E: encabezado');
	const restored = page.locator('main [role="textbox"]').first();
	await expect(restored).toHaveClass(/block-editable--h2/);
	await expect(restored).toHaveText('Titulo de seccion');
	await expect(page.locator('main [role="textbox"]')).toHaveCount(blocksBefore);
});

test('regression guard: the copy block button still works after formatting changes', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: copiar');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('texto con formato', { delay: 25 });
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('texto con formato');

	const row = page.locator('main .group').first();
	await row.hover();
	await row.getByRole('button', { name: 'Copiar bloque' }).click();
	await expect
		.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).length)
		.toBeGreaterThan(0);

	// Copying does not mutate the block's own text.
	await expect(first).toHaveText('texto con formato');
});
