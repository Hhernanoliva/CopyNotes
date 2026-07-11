import { test, expect } from '@playwright/test';

// Critical MVP flows (spec 017 quality gates). Each test gets a fresh browser
// context — and therefore a fresh IndexedDB — so the first-run demo note is
// seeded at the start of every test.

const title = (page) => page.getByLabel('Título de la nota');

test('first run seeds an editable demo note', async ({ page }) => {
	await page.goto('/');
	await expect(title(page)).toHaveValue(/Bienvenido a CopyNotes/);
	await expect(page.locator('main [role="textbox"]').first()).toBeVisible();
	await expect(page.locator('[role="checkbox"]').first()).toBeVisible();
});

test('create a note, nest a bullet, and it survives a reload', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Nota E2E');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Padre', { delay: 25 });
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo', { delay: 25 });
	await page.keyboard.press('Tab'); // nest under Padre
	await page.waitForTimeout(700); // let autosave flush

	await page.reload();
	await expect(title(page)).toHaveValue('Nota E2E');
	const rows = page.locator('main .group');
	const pads = await rows.evaluateAll((els) =>
		els.map((el) => parseFloat(getComputedStyle(el).paddingLeft) || 0)
	);
	expect(pads.some((p) => p > 0)).toBeTruthy(); // the child kept its indent
	await expect(page.locator('main [role="textbox"]', { hasText: 'Hijo' })).toBeVisible();
});

test('undo reverses typing and a new block, and the result persists', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Undo E2E');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Primero', { delay: 20 });
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Segundo', { delay: 20 });
	await page.waitForTimeout(150);
	await expect(page.locator('main [role="textbox"]', { hasText: 'Segundo' })).toBeVisible();

	// Undo the "Segundo" typing burst, then the Enter that created the block.
	await page.keyboard.press('Control+z');
	await page.waitForTimeout(120);
	await page.keyboard.press('Control+z');
	await page.waitForTimeout(700); // let the restore persist

	await expect(page.locator('main [role="textbox"]', { hasText: 'Segundo' })).toHaveCount(0);

	await page.reload();
	await expect(title(page)).toHaveValue('Undo E2E');
	await expect(page.locator('main [role="textbox"]', { hasText: 'Segundo' })).toHaveCount(0);
	await expect(page.locator('main [role="textbox"]', { hasText: 'Primero' })).toBeVisible();
});

test('pasting CopyNotes clipboard content rebuilds block types and nesting', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Round trip');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Una nota', { delay: 10 });
	await page.waitForTimeout(200);

	// Simulate pasting content copied inside CopyNotes: a code block and a
	// checked todo travel on the app's own clipboard format. The paste handler
	// must rebuild them as code + todo, not flatten them to text.
	const forest = JSON.stringify([
		{ type: 'code', content: 'saludar()', checked: false, note: '', children: [] },
		{ type: 'todo', content: 'listo', checked: true, note: '', children: [] }
	]);
	await first.evaluate((el, payload) => {
		const dt = new DataTransfer();
		dt.setData('web application/x-copynotes+json', payload);
		el.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
		);
	}, forest);
	await page.waitForTimeout(500);

	await expect(page.locator('main [role="textbox"].font-mono')).toHaveCount(1);
	await expect(page.locator('main [role="checkbox"][aria-checked="true"]')).toHaveCount(1);

	// And it survives a reload (persisted through storage).
	await page.waitForTimeout(600);
	await page.reload();
	await expect(page.locator('main [role="textbox"].font-mono')).toHaveCount(1);
	await expect(page.locator('main [role="checkbox"][aria-checked="true"]')).toHaveCount(1);
});

test('a checked todo persists across reload', async ({ page }) => {
	await page.goto('/');
	const firstUnchecked = page.locator('[role="checkbox"][aria-checked="false"]').first();
	await firstUnchecked.click();
	await page.waitForTimeout(700);
	await page.reload();
	await expect(page.locator('[role="checkbox"][aria-checked="true"]').first()).toBeVisible();
});

test('copy a block writes text to the clipboard', async ({ page }) => {
	await page.goto('/');
	const row = page.locator('main .group').first();
	await row.hover();
	await row.getByRole('button', { name: 'Copiar bloque' }).click();
	// The clipboard write is async; poll until the text lands.
	await expect
		.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).length)
		.toBeGreaterThan(0);
});

test('save a block as a snippet and find it in the Snippets view', async ({ page }) => {
	await page.goto('/');
	const row = page.locator('main .group').first();
	await row.hover();
	await row.getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Guardar como snippet' }).click();
	await expect(page.getByText('Snippet guardado')).toBeVisible();

	await page.getByRole('button', { name: 'Snippets' }).click();
	await expect(page.getByRole('button', { name: 'Insertar en la nota' }).first()).toBeAttached();
});

test('search finds a block by its text', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.getByLabel('Texto a buscar').fill('anidar');
	await page.waitForTimeout(200);
	await expect(page.getByText(/anidar/i).first()).toBeVisible();
});

test('exporting a full backup downloads a JSON file with the notes', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Respaldo' }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: /Descargar respaldo completo/ }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/\.json$/);
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	expect(backup.data.notes.length).toBeGreaterThan(0);
});

test('the theme toggle switches between dark and light', async ({ page }) => {
	await page.goto('/');
	const root = page.locator('html');
	const before = await root.getAttribute('class');
	await page.getByRole('button', { name: /Activar modo/ }).click();
	await page.waitForTimeout(150);
	const after = await root.getAttribute('class');
	expect(after).not.toBe(before);
});

test('the help panel opens with the ? key and lists shortcuts', async ({ page }) => {
	await page.goto('/');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Shift+Slash'); // "?"
	const dialog = page.locator('dialog[aria-labelledby="help-title"]');
	await expect(dialog).toBeVisible();
	expect(await dialog.locator('kbd').count()).toBeGreaterThan(10);
});

test('the app still works offline after the first visit', async ({ page, context }) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	// Wait until the service worker is registered and active, then cut the
	// network: the reload must be served entirely from the precache.
	await page.evaluate(async () => {
		const reg = await navigator.serviceWorker.ready;
		return !!reg.active;
	});
	await page.waitForTimeout(300);
	await context.setOffline(true);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForTimeout(500);
	await expect(page.locator('main#contenido-principal')).toBeVisible();
	await expect(title(page)).toHaveValue(/Bienvenido/);
	await context.setOffline(false);
});
