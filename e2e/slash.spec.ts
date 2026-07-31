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
	// Fecha, Separador and Snippet are absent: Separador would wipe every
	// selected row's text, Fecha is a per-row field, and Snippet isn't a type.
	await expect(menu.getByRole('option')).toHaveCount(7);

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

// Regression: converting a MIXED selection (one row already a task, one not)
// must not duplicate the 'created' activity line for the row that was already
// a task — applySelectionType only routes a row through convertToTask when it
// genuinely becomes a task; a row that stays 'todo' goes through updateBlock,
// same as any other type. Seeded via IndexedDB (same pattern as
// user-task-activity.spec.ts) so the already-a-task row starts with zero
// activity of its own, and any duplicate would show up as a second entry.
test('converting a mixed selection to Tarea does not duplicate the activity line for a row that was already a task', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByLabel('Título de la nota')).toBeVisible();

	await page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const now = new Date().toISOString();
					const tx = db.transaction(['notes', 'blocks'], 'readwrite');
					tx.objectStore('notes').put({
						id: 'e2e-mixed-note',
						title: 'Nota mixta',
						agentVisible: true,
						sortOrder: -1,
						folderId: null,
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					const block = (id, type, content, order) => ({
						id,
						noteId: 'e2e-mixed-note',
						parentBlockId: null,
						type,
						content,
						html: content,
						order,
						collapsed: false,
						codeCollapsed: false,
						checked: false,
						note: '',
						dueDate: null,
						createdBy: 'user',
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					tx.objectStore('blocks').put(block('e2e-mixed-a', 'todo', 'Ya tarea', 0));
					tx.objectStore('blocks').put(block('e2e-mixed-b', 'bullet', 'Viñeta suelta', 1));
					tx.oncomplete = () => {
						db.close();
						resolve(null);
					};
					tx.onerror = () => reject(tx.error);
				};
			})
	);

	await page.reload();
	await expect(page.getByLabel('Título de la nota')).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Lista de notas' })
		.getByRole('button', { name: 'Nota mixta', exact: true })
		.click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.press('Shift+ArrowDown');

	const menu = page.locator('#slash-menu');
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.getByRole('option', { name: 'Tarea' }).click();
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(2);

	await page.getByRole('button', { name: 'Configuración' }).click();
	// Only "Viñeta suelta" genuinely became a task here; "Ya tarea" already was
	// one, so it must not gain a second 'created' line.
	await expect(page.getByText('creaste una tarea')).toHaveCount(1);
});

// Regression: shrinking the selection back to one row while the group menu is
// open used to leave a ghost menu on screen — its keys dead (Enter inserted a
// new row under it), and every later "/" (even typed into a single row) kept
// hijacking into the same stale group menu instead of opening the ordinary
// one. slashOpen must gate on whether a real (2+) selection still exists, not
// just on whether a group menu index was ever set.
test('shrinking the selection to one row closes the group menu, and "/" then opens the ordinary menu', async ({
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
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // focus lands on the new block asynchronously
	await page.keyboard.type('tres');

	// Select all three rows downwards from the top.
	await first.click();
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');

	const menu = page.locator('#slash-menu');
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();

	// Shrink the selection back down to a single row while the menu is open.
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('Shift+ArrowUp');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(0);

	// The lone row's own "/" still works — it opens the ORDINARY menu, not a
	// stale group one.
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await expect(menu).toHaveAttribute('aria-label', 'Tipos de bloque');
	await page.keyboard.press('Escape');
});
