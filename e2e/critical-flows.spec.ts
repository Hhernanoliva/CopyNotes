import { test, expect } from '@playwright/test';

// Critical MVP flows (spec 017 quality gates). Each test gets a fresh browser
// context — and therefore a fresh IndexedDB — so the first-run demo note is
// seeded at the start of every test.

const title = (page) => page.getByLabel('Título de la nota');

async function pasteText(locator, text) {
	await locator.evaluate((element, value) => {
		const data = new DataTransfer();
		data.setData('text/plain', value);
		element.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);
	}, text);
}

test('first run seeds an editable demo note', async ({ page }) => {
	await page.goto('/');
	await expect(title(page)).toHaveValue(/Bienvenido a CopyNotes/);
	await expect(page.locator('main [role="textbox"]').first()).toBeVisible();
	await expect(page.locator('[role="checkbox"]').first()).toBeVisible();
});

test('the tag shortcut restores # on cancel and consumes it after assigning a tag', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('#');

	const picker = page.getByRole('combobox', { name: 'Buscar o crear etiqueta' });
	await expect(picker).toBeVisible();
	await expect(first).toHaveText('');
	await page.keyboard.press('Escape');
	await expect(picker).toBeHidden();
	await expect(first).toHaveText('#');

	await first.fill('');
	await page.keyboard.type('#');
	await picker.fill('proyecto');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Escape');

	await expect(first).toHaveText('');
	await expect(page.getByRole('button', { name: 'Quitar etiqueta proyecto' })).toBeVisible();

	// Dismissing with a click outside must also give the "#" back, not eat it.
	await page.keyboard.type('#');
	await expect(picker).toBeVisible();
	await title(page).click();
	await expect(picker).toBeHidden();
	await expect(first).toHaveText('#');
});

test('the slash menu groups headings and shows every block type without scrolling', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	await expect(page.getByRole('option', { name: 'Snippet' })).toBeVisible();

	const headings = [
		page.getByRole('option', { name: 'Título 1' }),
		page.getByRole('option', { name: 'Título 2' }),
		page.getByRole('option', { name: 'Título 3' })
	];
	const headingTops = await Promise.all(
		headings.map(async (heading) => Math.round((await heading.boundingBox()).y))
	);
	expect(new Set(headingTops).size).toBe(1);
	expect(await menu.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBeTruthy();
});

test('code paste keeps whitespace, scrolls horizontally and remembers collapse', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.press('Control+Enter');
	const blockNote = page.getByRole('textbox', { name: 'Comentario del bloque' });
	await page.keyboard.type('Nota retenida');
	await page.keyboard.press('Escape');
	await page.keyboard.type('/code');
	await page.getByRole('option', { name: 'Código' }).click();

	const raw = [
		'function render(items) {',
		'\tconst result = [];',
		'',
		'\tfor (const item of items) {',
		'\t\tresult.push({',
		'\t\t\tid: item.id,',
		'\t\t\tlabel: item.label,',
		'\t\t\tactive: item.active',
		'\t\t});',
		'\t}',
		'',
		'\treturn result;',
		'}',
		'const output = render(items);',
		'console.log(output);'
	].join('\n');
	await pasteText(first, raw);

	const code = page.locator('main [role="textbox"].block-editable--code');
	await expect.poll(() => code.evaluate((element) => element.innerText)).toBe(raw);
	const styles = await code.evaluate((element) => {
		const computed = getComputedStyle(element);
		return { whiteSpace: computed.whiteSpace, tabSize: computed.tabSize, overflowX: computed.overflowX };
	});
	expect(styles).toEqual({ whiteSpace: 'pre', tabSize: '4', overflowX: 'auto' });
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo visible');
	await page.keyboard.press('Tab');
	await expect(page.getByText('Hijo visible', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: /Contraer código/ }).click();
	await expect(code).toHaveCount(0);
	const preview = page.getByLabel('Vista previa de código');
	await expect.poll(() => preview.evaluate((element) => element.innerText)).toBe(raw.split('\n').slice(0, 6).join('\n'));
	await expect(page.getByText('Hijo visible', { exact: true })).toBeVisible();
	const codeToggle = page.getByRole('button', { name: /Ver código completo/ });
	await blockNote.click();
	await page.keyboard.press('Escape');
	await expect(codeToggle).toBeFocused();
	await page.keyboard.press('Control+c');
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${raw}\n  Nota retenida`);

	// The collapse control behaves like any block surface: Enter makes a new
	// block instead of re-toggling the preview, and the preview stays collapsed.
	await codeToggle.focus();
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // wait for the new block to mount and take focus
	await page.keyboard.type('Renglón nuevo');
	await expect(page.getByText('Renglón nuevo', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Vista previa de código')).toBeVisible();

	await page.waitForTimeout(700); // let the pasted content autosave before reload
	await page.reload();
	await expect(page.getByRole('button', { name: /Ver código completo/ })).toBeVisible();
	await expect(page.getByText('Hijo visible', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: /Ver código completo/ }).click();
	await expect.poll(() => page.locator('main .block-editable--code').evaluate((element) => element.innerText)).toBe(raw);
});

test('multi-line code is detected without turning prose or lists into code', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	const source = 'const total = items.length;\n\tconsole.log(total);';
	await first.click();
	await pasteText(first, source);
	await expect(page.locator('main .block-editable--code')).toHaveCount(1);
	await expect.poll(() => page.locator('main .block-editable--code').evaluate((element) => element.innerText)).toBe(source);

	await page.keyboard.press('Enter');
	await page.waitForTimeout(150); // wait for the new sibling block to mount
	const last = page.locator('main [data-block-id] .block-editable').last();
	await pasteText(last, '- comprar pan\n- llamar a Clara');
	await expect(page.locator('main .block-editable--code')).toHaveCount(1);
	await expect(page.locator('main [aria-label="Viñeta"]')).toHaveCount(2);

	await page.getByRole('button', { name: 'Nueva nota' }).click();
	const prose = page.locator('main [data-block-id] .block-editable').first();
	await pasteText(prose, 'Create a new note\nUpdate the title\nDelete the draft');
	await expect(page.locator('main .block-editable--code')).toHaveCount(0);
});

test('code paste replaces a DOM selection without corrupting line breaks', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/code');
	await page.getByRole('option', { name: 'Código' }).click();
	await first.evaluate((element) => {
		element.innerHTML = 'abc<br>def';
		const text = element.childNodes[2];
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 1);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		const data = new DataTransfer();
		data.setData('text/plain', 'X');
		element.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);
	});
	await expect.poll(() => first.evaluate((element) => element.innerText)).toBe('abc\nXef');
});

test('a reload right after typing keeps the last keystrokes', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Persistencia rápida');
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('último renglón');

	// No waiting: the reload lands inside the 500ms save debounce on purpose.
	await page.reload();
	await expect(title(page)).toHaveValue('Persistencia rápida');
	await expect(page.locator('main [data-block-id] .block-editable').first()).toHaveText(
		'último renglón'
	);
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
		{ type: 'code', content: 'saludar()', checked: false, note: '', tags: [], children: [] },
		{ type: 'todo', content: 'listo', checked: true, note: '', tags: [], children: [] },
		{ type: 'separator', content: '', checked: false, note: '', tags: [], children: [] },
		{ type: 'bullet', content: 'con etiqueta', checked: false, note: '', tags: ['prueba'], children: [] }
	]);
	await first.evaluate((el, payload) => {
		const dt = new DataTransfer();
		dt.setData('web application/x-copynotes+json', payload);
		el.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
		);
	}, forest);
	await page.waitForTimeout(600);

	await expect(page.locator('main [role="textbox"].font-mono')).toHaveCount(1);
	await expect(page.locator('main [role="checkbox"][aria-checked="true"]')).toHaveCount(1);
	await expect(page.locator('main [role="separator"]')).toHaveCount(1);
	await expect(page.getByText('prueba', { exact: false })).toBeVisible();

	// And it survives a reload (persisted through storage).
	await page.waitForTimeout(600);
	await page.reload();
	await expect(page.locator('main [role="textbox"].font-mono')).toHaveCount(1);
	await expect(page.locator('main [role="checkbox"][aria-checked="true"]')).toHaveCount(1);
	await expect(page.locator('main [role="separator"]')).toHaveCount(1);
	await expect(page.getByText('prueba', { exact: false })).toBeVisible();
});

test('paste falls back to the localStorage buffer when only text/plain arrives', async ({ page }) => {
	// The browser does not always deliver the custom clipboard format. This
	// covers the fallback: content copied inside CopyNotes is stashed in
	// localStorage keyed by its plain text; a paste whose text/plain matches
	// rebuilds the exact blocks even without the custom format. (Playwright's
	// synthetic Ctrl+V does not fire a real paste, so we dispatch the event.)
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Buffer');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Una nota', { delay: 10 });
	await page.waitForTimeout(200);

	await page.evaluate(() => {
		const payload = JSON.stringify([
			{ type: 'code', content: 'saludar()', checked: false, note: '', tags: [], children: [] }
		]);
		localStorage.setItem('copynotes:clipboard', JSON.stringify({ text: 'saludar()', payload }));
	});
	await first.evaluate((el) => {
		const dt = new DataTransfer();
		dt.setData('text/plain', 'saludar()'); // matches the buffered text; no custom format
		el.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
		);
	});
	await page.waitForTimeout(500);

	await expect(page.locator('main [role="textbox"].font-mono')).toHaveCount(1);
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
	// The saved snippet shows in the library; snippets are inserted from the
	// note with the / menu, so the row itself only keeps favorite + delete.
	const library = page.getByRole('region', { name: 'Biblioteca de snippets' });
	await expect(library.getByRole('button', { name: 'Borrar snippet' }).first()).toBeAttached();
	await expect(page.getByRole('button', { name: 'Insertar en la nota' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Etiquetar snippet' })).toHaveCount(0);
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

test('double Enter leaves the block note and opens a new normal line', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-surface]').first();
	await first.click();
	await page.keyboard.type('Línea principal');
	await page.keyboard.press('Control+Enter');
	const blockNote = page.getByRole('textbox', { name: 'Comentario del bloque' });
	await expect(blockNote).toBeFocused();
	await page.keyboard.type('una nota');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	// The note keeps its text (no trailing blank line) and a fresh block below
	// takes the focus.
	await expect(blockNote).toHaveText('una nota');
	const surfaces = page.locator('main [data-block-surface]');
	await expect(surfaces).toHaveCount(2);
	await expect(surfaces.nth(1)).toBeFocused();
	await page.keyboard.type('sigo escribiendo');
	await expect(surfaces.nth(1)).toHaveText('sigo escribiendo');
});

test('a parent block shows a second button that copies it with its children', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-surface]').first();
	await first.click();
	await page.keyboard.type('Padre');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(150);

	const rows = page.locator('main .group');
	await rows.first().hover();
	const copyAll = rows.first().getByRole('button', { name: 'Copiar con subniveles' });
	await expect(copyAll).toBeVisible();
	await copyAll.click();
	await expect
		.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
		.toContain('Padre');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Hijo');

	// A block without children only offers the plain copy button.
	await rows.nth(1).hover();
	await expect(rows.nth(1).getByRole('button', { name: 'Copiar bloque' })).toBeVisible();
	await expect(rows.nth(1).getByRole('button', { name: 'Copiar con subniveles' })).toHaveCount(0);
});
