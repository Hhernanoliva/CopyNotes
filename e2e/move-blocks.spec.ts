import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Alt+Arrow moves a line among its siblings; at the parent's edge it now
// escapes the parent (fix: it used to stop there), landing at the parent's
// level. The note's top/bottom is still the hard limit.

const blockTexts = (page) =>
	page.$$eval('main [data-block-id] .block-editable', (els) =>
		els.map((el) => el.textContent ?? '')
	);

test('Alt+Arrow moves a line out of its parent in both directions', async ({ page }) => {
	await newNote(page);

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

// Regression: Backspace on an EMPTY line that still has sub-items used to leave a
// stuck "ghost" row (empty, undeletable, caret trapped). Now the row is removed and
// its children rise one level to take its place — nothing lost, caret goes up.
test('Backspace on an emptied parent lifts its children up instead of ghosting', async ({ page }) => {
	await newNote(page);

	// Build: Padre > [Hijo 1, Hijo 2]
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Padre');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 1');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(150);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 2');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2']);

	// Empty "Padre", then Backspace once more on the now-empty row.
	await page.getByText('Padre', { exact: true }).click();
	await page.keyboard.press('End');
	for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');

	// "Padre" is gone; both children rose to root level, order preserved.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await expect(page.locator('main [data-block-id]', { hasText: 'Hijo 1' })).toHaveCSS(
		'padding-left',
		'0px'
	);
	await expect(page.locator('main [data-block-id]', { hasText: 'Hijo 2' })).toHaveCSS(
		'padding-left',
		'0px'
	);

	// Survives a reload.
	await page.waitForTimeout(700);
	await page.reload();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
});

// Drag-to-reorder-and-nest: long-press a line (~350ms hold), then drag. A
// quick drag is text-selection, not a move. Dragging right nests the line.

const HOLD = 450; // exceed the controller's 350ms long-press

// Seed three root lines A / B / C, top to bottom.
async function seedABC(page) {
	await newNote(page);
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
	await newNote(page);
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

// El gate que se creía imposible de automatizar: arrastrar un texto dentro del
// MISMO renglón inmediatamente después de escribirlo. El guardado con retraso
// lleva adentro una copia del texto de hace medio segundo, así que un arrastre
// que no pasara por `writeBlock` se revertía solo ~500 ms después de soltar —
// y sólo si la persona se quedaba quieta, porque la próxima tecla lo tapaba.
// El arrastre nativo del navegador no se puede guionar, pero éste es un gesto
// de puntero propio (spec 026) y `page.mouse` lo hace igual.
test('arrastrar un texto justo después de escribirlo no se revierte solo', async ({ page }) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('el gato duerme en la silla', { delay: 20 });

	// Sin pausa: el guardado de la última tecla sigue armado en este momento.
	const coords = await page.evaluate(() => {
		const el = document.querySelector('main [data-block-id] .block-editable');
		const i = el.innerText.indexOf('gato');
		const range = document.createRange();
		range.setStart(el.firstChild, i);
		range.setEnd(el.firstChild, i + 4);
		const s = window.getSelection();
		s.removeAllRanges();
		s.addRange(range);
		const r = range.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		return {
			x: r.left + r.width / 2,
			y: r.top + r.height / 2,
			dropX: box.right - 2,
			dropY: box.top + box.height / 2
		};
	});
	await page.mouse.move(coords.x, coords.y);
	await page.mouse.down();
	await page.mouse.move(coords.x + 10, coords.y + 6, { steps: 2 });
	await page.mouse.move(coords.dropX, coords.dropY, { steps: 8 });
	await page.mouse.up();

	// Quedarse quieto es la única forma de ver el bug: el timer del guardado
	// viejo vence acá, y sin la puerta única devolvía el texto de antes.
	const moved = 'el  duerme en la sillagato';
	await expect.poll(() => blockTexts(page)).toEqual([moved]);
	await page.waitForTimeout(1200);
	await expect.poll(() => blockTexts(page)).toEqual([moved]);

	// Y aterrizó de verdad: recargar no lo devuelve a como estaba.
	await page.reload();
	await expect.poll(() => blockTexts(page)).toEqual([moved]);
});

// Regression: with several lines selected, Tab used to indent only the focused
// one (the selection handler had no Tab branch, so the key fell through to the
// single-row handler). Now the whole group moves a level, and Shift+Tab returns it.
test('Tab indents every selected line, not just the first', async ({ page }) => {
	await newNote(page);

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Uno');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Dos');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Tres');
	await expect.poll(() => blockTexts(page)).toEqual(['Uno', 'Dos', 'Tres']);

	// Select "Dos" + "Tres" from "Dos" upward-free: focus is on "Tres", so a
	// Shift+ArrowUp grows the selection to cover both.
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('Tab');

	const row = (text) => page.locator('main [data-block-id]', { hasText: text });
	await expect(row('Dos')).not.toHaveCSS('padding-left', '0px');
	await expect(row('Tres')).not.toHaveCSS('padding-left', '0px');
	await expect(row('Uno')).toHaveCSS('padding-left', '0px');
	// Order is preserved: they land under "Uno" as Dos, Tres.
	await expect.poll(() => blockTexts(page)).toEqual(['Uno', 'Dos', 'Tres']);

	// Shift+Tab brings the whole group back out, still in order.
	await page.keyboard.press('Shift+Tab');
	await expect(row('Dos')).toHaveCSS('padding-left', '0px');
	await expect(row('Tres')).toHaveCSS('padding-left', '0px');
	await expect.poll(() => blockTexts(page)).toEqual(['Uno', 'Dos', 'Tres']);

	// One undo puts the indent back (the group move is a single history step).
	await page.keyboard.press('ControlOrMeta+z');
	await expect(row('Dos')).not.toHaveCSS('padding-left', '0px');
	await expect(row('Tres')).not.toHaveCSS('padding-left', '0px');
});

// Shift+click inside the SAME row is plain text selection — even with the caret
// parked on the first character, where the block-range handler used to swallow
// it and leave nothing selected. Shift+click on ANOTHER row still selects the
// range of rows.
test('Shift+click selects text inside the row and rows across rows', async ({ page }) => {
	await newNote(page);

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('abcdefghijklmnop');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Segundo');

	// Caret on the first character of row 1, then Shift+click further along it.
	await first.click();
	await page.keyboard.press('Home');
	const box = await first.boundingBox();
	await page.keyboard.down('Shift');
	await page.mouse.click(box.x + 60, box.y + box.height / 2);
	await page.keyboard.up('Shift');
	const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
	expect(selected.length).toBeGreaterThan(0);
	expect('abcdefghijklmnop').toContain(selected);

	// Shift+click on the other row still builds a two-row block selection.
	const second = page.locator('main [data-block-id] .block-editable').nth(1);
	const secondBox = await second.boundingBox();
	await page.keyboard.down('Shift');
	await page.mouse.click(secondBox.x + 20, secondBox.y + secondBox.height / 2);
	await page.keyboard.up('Shift');
	await expect(page.getByText('2 renglones seleccionados')).toBeAttached();
});

// Bare ArrowDown used to get stuck on the first empty row: an empty row gives
// the caret a zero rect, so the "am I on the last visual line?" check compared
// against the top of the screen and never said yes. ArrowUp worked by accident.
test('ArrowDown walks down through empty rows, not just up', async ({ page }) => {
	await newNote(page);

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Uno');
	for (let i = 0; i < 3; i++) {
		await page.keyboard.press('Enter');
		await page.waitForTimeout(150);
	}
	await page.keyboard.type('Cuatro');
	await page.waitForTimeout(200);

	const activeIndex = () =>
		page.evaluate(() => {
			const rows = [...document.querySelectorAll('main [data-block-id] .block-editable')];
			return rows.indexOf(document.activeElement);
		});

	// From the written row, ↓ crosses both empty rows and reaches "Cuatro".
	await first.click();
	expect(await activeIndex()).toBe(0);
	for (const expected of [1, 2, 3]) {
		await page.keyboard.press('ArrowDown');
		await expect.poll(activeIndex).toBe(expected);
	}
	// And ↑ comes all the way back.
	for (const expected of [2, 1, 0]) {
		await page.keyboard.press('ArrowUp');
		await expect.poll(activeIndex).toBe(expected);
	}
});
