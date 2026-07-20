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

// Drag-to-reorder-and-nest: long-press a line (~350ms hold), then drag. A
// quick drag is text-selection, not a move. Dragging right nests the line.

const HOLD = 450; // exceed the controller's 350ms long-press

// Seed three root lines A / B / C, top to bottom.
async function seedABC(page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('A');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('B');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('C');
	await expect.poll(() => blockTexts(page)).toEqual(['A', 'B', 'C']);
}

test('drag a line to reorder it above the first', async ({ page }) => {
	await seedABC(page);
	const rows = page.locator('main [data-block-id]');
	const cBox = await rows.nth(2).boundingBox();
	const aBox = await rows.nth(0).boundingBox();

	await page.mouse.move(cBox.x + 40, cBox.y + cBox.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(HOLD); // long-press arms the drag
	// drag up to just above the first line's midpoint, at root depth (left)
	await page.mouse.move(aBox.x + 40, aBox.y + 2, { steps: 10 });
	await page.mouse.up();

	await expect.poll(() => blockTexts(page)).toEqual(['C', 'A', 'B']);
});

test('a quick drag selects text and does not move the line', async ({ page }) => {
	await seedABC(page);
	const rows = page.locator('main [data-block-id]');
	const cBox = await rows.nth(2).boundingBox();
	const aBox = await rows.nth(0).boundingBox();

	await page.mouse.move(cBox.x + 40, cBox.y + cBox.height / 2);
	await page.mouse.down();
	// move immediately, no hold: this is text-selection, arming cancels
	await page.mouse.move(aBox.x + 40, aBox.y + 2, { steps: 10 });
	await page.mouse.up();

	await expect.poll(() => blockTexts(page)).toEqual(['A', 'B', 'C']);
});

test('dragging right nests the line under the previous one', async ({ page }) => {
	await seedABC(page);
	const rows = page.locator('main [data-block-id]');
	const bBox = await rows.nth(1).boundingBox();
	const aBox = await rows.nth(0).boundingBox();

	// long-press B, drag into the gap right below A and to the right -> child of A
	await page.mouse.move(bBox.x + 40, bBox.y + bBox.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(HOLD);
	await page.mouse.move(aBox.x + 40 + 30, aBox.y + aBox.height - 2, { steps: 10 });
	await page.mouse.up();

	// order unchanged, but B is now indented under A
	await expect.poll(() => blockTexts(page)).toEqual(['A', 'B', 'C']);
	const bRow = page.locator('main [data-block-id]', { hasText: 'B' });
	await expect(bRow).not.toHaveCSS('padding-left', '0px');
});

// Regression: dragging a SELECTED WORD is native text drag-and-drop — it must
// not hijack into a whole-line block move (the long-press must stay disarmed
// while a text selection is live). We assert the line order is untouched; the
// word itself may move via the browser's native DnD, which is fine.
test('dragging a selected word does not move the whole line', async ({ page }) => {
	await seedABC(page);
	const rows = page.locator('main [data-block-id]');
	const aBox = await rows.nth(0).boundingBox();
	const cBox = await rows.nth(2).boundingBox();

	// Select the letter/word content of line A.
	const aEditable = rows.nth(0).locator('.block-editable');
	const box = await aEditable.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
		const r = range.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});

	// Press on the selection, hold past the long-press window, drag to line C.
	await page.mouse.move(box.x, box.y);
	await page.mouse.down();
	await page.waitForTimeout(HOLD);
	await page.mouse.move(cBox.x + 40, cBox.y + cBox.height - 2, { steps: 8 });
	await page.mouse.up();
	await page.waitForTimeout(200);

	// The line block must NOT have been reordered (A is still first, C still last).
	const texts = await blockTexts(page);
	expect(texts[0].startsWith('A')).toBe(true);
	expect(texts[2].includes('C')).toBe(true);
	await expect(rows.nth(0)).toHaveCSS('padding-left', '0px'); // not nested either
	void aBox;
});

// Spec 026: dragging a selected word MOVES that text (custom text drag), not the
// whole line, and a single undo restores it. Quick grab, no long hold.
test('dragging a selected word moves the text to another line', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('hola mundo', { delay: 20 });
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('otra', { delay: 20 });
	await expect.poll(() => blockTexts(page)).toEqual(['hola mundo', 'otra']);

	// Select "mundo" and grab the drop coordinates (end of line 2).
	const coords = await page.evaluate(() => {
		const els = document.querySelectorAll('main [data-block-id] .block-editable');
		const el = els[0];
		const i = el.innerText.indexOf('mundo');
		const range = document.createRange();
		range.setStart(el.firstChild, i);
		range.setEnd(el.firstChild, i + 5);
		const s = window.getSelection();
		s.removeAllRanges();
		s.addRange(range);
		const r = range.getBoundingClientRect();
		const second = els[1].getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, dropX: second.right - 2, dropY: second.top + second.height / 2 };
	});

	// Quick drag (no long hold) — the custom text drag takes over.
	await page.mouse.move(coords.x, coords.y);
	await page.mouse.down();
	await page.mouse.move(coords.x + 10, coords.y + 6, { steps: 2 });
	await page.mouse.move(coords.dropX, coords.dropY, { steps: 8 });
	await page.mouse.up();

	await expect.poll(() => blockTexts(page)).toEqual(['hola ', 'otramundo']);

	// One undo restores both lines.
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => blockTexts(page)).toEqual(['hola mundo', 'otra']);
});
