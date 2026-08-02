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

// El almanaque es nuestro justamente para que UN toque en el día sea la
// elección: el campo `<input type="date">` del sistema no lo permitía (en
// iPhone escribe hoy apenas se abre y avisa en cada giro de la ruedita, así que
// aplicar en `change` guardaba una fecha fantasma y cerraba el panel).
test('un toque en el día del almanaque lo aplica, sin confirmar', async ({ page }) => {
	await page.clock.install({ time: new Date(2026, 7, 3, 10, 0, 0) }); // 3 de agosto
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.keyboard.press('Enter');

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: 'Elegir día…' }).click();

	// Se abre en el mes de hoy, y el día se elige de una.
	await expect(panel.getByText('agosto 2026')).toBeVisible();
	await panel.getByRole('button', { name: '14 de agosto de 2026', exact: true }).click();
	await expect(panel).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/14 ago/);

	// Al reabrirlo, el almanaque arranca en el día que ya tiene puesto.
	await page.getByRole('button', { name: 'Cambiar fecha' }).click();
	await panel.getByRole('button', { name: 'Elegir día…' }).click();
	await expect(panel.getByRole('button', { name: '14 de agosto de 2026', exact: true })).toBeFocused();
});

// Los meses se caminan con las flechas y el mes cambia solo al pasarse de borde.
test('el almanaque se camina con las flechas', async ({ page }) => {
	await page.clock.install({ time: new Date(2026, 7, 3, 10, 0, 0) }); // lunes 3 de agosto
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/fecha');
	await expect(page.locator('#slash-menu')).toBeVisible();
	await page.keyboard.press('Enter');

	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await panel.getByRole('button', { name: 'Elegir día…' }).click();
	await expect(panel.getByRole('button', { name: '3 de agosto de 2026', exact: true })).toBeFocused();

	await page.keyboard.press('ArrowDown'); // +1 semana
	await expect(panel.getByRole('button', { name: '10 de agosto de 2026', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowLeft'); // -1 día
	await expect(panel.getByRole('button', { name: '9 de agosto de 2026', exact: true })).toBeFocused();

	// Cruzar el borde del mes lo cambia solo.
	await panel.getByRole('button', { name: 'Mes siguiente' }).click();
	await expect(panel.getByText('septiembre 2026')).toBeVisible();

	await page.keyboard.press('Enter'); // el foco quedó en "Mes siguiente"
	await expect(panel.getByText('octubre 2026')).toBeVisible();
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

// Regression: deleting a note while the Agenda is open must drop the note's
// dated rows live. Before, the Agenda kept a stale badge that opened a note
// that no longer existed.
test('agenda drops a note’s dates live when the note is deleted', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	// Name the note so we can target its trash button unambiguously.
	await page.getByRole('textbox', { name: 'Título de la nota' }).fill('Cuentas');

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('pagar');
	await page.keyboard.type('/fecha');
	await page.getByRole('option', { name: 'Fecha' }).click();
	const panel = page.getByRole('dialog', { name: 'Fecha del renglón' });
	await expect(panel).toBeVisible();
	await page.getByRole('button', { name: 'Hoy' }).click();
	await expect(panel).not.toBeVisible();
	await page.waitForTimeout(700); // flush before the Agenda reads storage

	await page.getByRole('button', { name: 'Agenda', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toBeVisible();

	// Back to the Notes tab and delete the note there.
	await page.getByRole('button', { name: 'Notas', exact: true }).click();
	await page.getByRole('button', { name: 'Borrar nota Cuentas' }).click();

	// Re-open the Agenda: the deleted note's date must be gone, not a ghost that
	// opens a note that no longer exists.
	await page.getByRole('button', { name: 'Agenda', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toHaveCount(0);
});
