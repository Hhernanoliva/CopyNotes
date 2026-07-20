import { test, expect } from '@playwright/test';

// Spec 021 Slice A: /fecha puts a badge on the line and it survives reload.

test('slash date assigns a persistent badge', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();
	await page.getByRole('option', { name: 'Fecha' }).click();

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();

	const badge = page.getByRole('button', { name: 'Cambiar fecha' });
	await expect(badge).toHaveText(/hoy/);

	await page.waitForTimeout(700); // let autosave flush before reload
	await page.reload();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/hoy/);

	await page.getByRole('button', { name: 'Cambiar fecha' }).click();
	await page.getByRole('button', { name: 'Quitar fecha' }).click();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveCount(0);
});

// Spec 021 follow-up: the app open across midnight must roll date labels over
// on its own, without a reload. Playwright's clock mock lets us cross midnight
// deterministically: a block dated "tomorrow" must relabel to "today".
test('date badge rolls from mañana to hoy at midnight without reload', async ({ page }) => {
	// Freeze the clock 30s before local midnight, BEFORE the app boots so its
	// day clock reads the mocked time.
	await page.clock.install({ time: new Date(2026, 6, 16, 23, 59, 30) });
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.getByRole('option', { name: 'Fecha' }).click();
	await page.getByRole('button', { name: 'Mañana' }).click();

	const badge = page.getByRole('button', { name: 'Cambiar fecha' });
	await expect(badge).toHaveText(/mañana/);

	// Advance past midnight (30s to the boundary + the clock's 1s cushion).
	await page.clock.fastForward(60_000);
	await expect(badge).toHaveText(/hoy/);
});

// The date panel is fully keyboard-driven: arrows rove the options, Enter picks.
test('date panel navigates with arrow keys', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.keyboard.press('Enter');

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hoy' })).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(page.getByRole('button', { name: 'Próxima semana' })).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.getByRole('button', { name: 'Mañana' })).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(panel).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/mañana/);
});

// The panel must never get stuck: clicking anywhere outside dismisses it,
// and the badge keeps working as a toggle (open → click badge → closed).
test('date panel closes on outside click and badge toggle', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.keyboard.press('Enter');

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();

	// Click into the note text (outside the panel): the panel must close.
	await first.click();
	await expect(panel).not.toBeVisible();

	// Give the block a date so the badge exists, then toggle via the badge.
	await page.keyboard.type('/fecha');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Hoy' }).click();
	const badge = page.getByRole('button', { name: 'Cambiar fecha' });
	await badge.click();
	await expect(panel).toBeVisible();
	await badge.click();
	await expect(panel).not.toBeVisible();
});

// Regression: adding a date while the Agenda is already open must show up
// live, without leaving and re-entering Agenda to force a re-read.
test('agenda updates live when a date is added while it is open', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('pagar');
	await page.waitForTimeout(700); // flush the text before the Agenda reads storage

	// Open the Agenda first — nothing is dated yet.
	await page.getByRole('button', { name: 'Agenda' }).click();
	await expect(page.getByText('Nada agendado')).toBeVisible();

	// Add a date in the editor WITHOUT leaving the Agenda.
	await first.click();
	await page.keyboard.press('End');
	await page.keyboard.type('/fecha');
	await page.getByRole('option', { name: 'Fecha' }).click();
	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();
	await expect(panel).not.toBeVisible();

	// The Agenda must reflect it live.
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toBeVisible();
});

// Spec 021 Slice B: the Agenda lists dated blocks and jumps to them.
test('agenda lists dated todos, toggles and navigates', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	// Make the first block a todo, give it today's date, then type its text.
	// Picking "Tarea"/"Fecha" from the slash menu strips only the "/query"
	// span, so on this empty block each pick leaves it empty again.
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/tarea');
	await page.getByRole('option', { name: 'Tarea' }).click();

	await page.keyboard.type('/fecha');
	await page.getByRole('option', { name: 'Fecha' }).click();
	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();
	await expect(panel).not.toBeVisible();

	// Click back into the block explicitly: the panel closing moves focus back
	// asynchronously, and typing before it lands would be dropped.
	await first.click();
	await page.keyboard.type('pagar');
	await page.waitForTimeout(700); // let autosave flush before the Agenda reads storage

	await page.getByRole('button', { name: 'Agenda' }).click();
	const hoyRegion = page.getByRole('region', { name: 'Hoy' });
	await expect(hoyRegion.getByText('pagar')).toBeVisible();

	await hoyRegion.getByText('pagar').click();
	await page.waitForTimeout(150); // let focus land on the block surface
	const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '');
	expect(focusedText).toContain('pagar');

	await page.getByRole('button', { name: 'Agenda' }).click();
	await page
		.getByRole('region', { name: 'Hoy' })
		.getByRole('checkbox', { name: 'Marcar tarea' })
		.click();
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toHaveClass(
		/line-through/
	);

	await page.getByRole('checkbox', { name: 'Ocultar completadas' }).click();
	await expect(page.getByRole('region', { name: 'Hoy' })).toHaveCount(0);

	// The toggle itself must stay visible even when it hides every item —
	// otherwise there's no way to turn it back off.
	const hideToggle = page.getByRole('checkbox', { name: 'Ocultar completadas' });
	await expect(hideToggle).toBeVisible();

	await hideToggle.click();
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toBeVisible();
});
