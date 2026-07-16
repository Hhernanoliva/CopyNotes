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

// Spec 021 Slice B: the Agenda lists dated blocks and jumps to them.
test('agenda lists dated todos, toggles and navigates', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	// Make the first block a todo, give it today's date, then type its text —
	// in that order, because picking "Tarea"/"Fecha" from the slash menu clears
	// whatever the block held (the slash query), so typing the real content has
	// to come last.
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
