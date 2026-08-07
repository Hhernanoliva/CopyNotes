import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Reads visibility straight out of the app's IndexedDB, bypassing the UI: the
// agent gate reads the database, not the screen, so this is the only honest way
// to ask "is it revoked YET?".
function countVisibleNotes(page) {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes'); // no version → current
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result
						.transaction('notes', 'readonly')
						.objectStore('notes')
						.getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () =>
						resolve(request.result.filter((note) => note.agentVisible === true).length);
				};
			})
	);
}

test('note header exposes an agent-visibility toggle that persists', async ({ page }) => {
	await openApp(page);
	// Create a note (adjust selector to your suite's helper if one exists).
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const toggle = page.getByRole('button', { name: 'Visible para agentes' });
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	// Survives a reload (persisted through updateNote).
	await page.reload();
	await expect(page.getByRole('button', { name: 'Visible para agentes' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('hiding a note from agents is persisted without waiting out the debounce', async ({
	page
}) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	const toggle = page.getByRole('button', { name: 'Visible para agentes' });

	// No polling on purpose: the database must already agree with the button the
	// moment the click returns. A debounced save fails both assertions.
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	expect(await countVisibleNotes(page)).toBe(1);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	expect(await countVisibleNotes(page)).toBe(0);
});

test('in the browser the agent toggle says it only takes effect on the desktop app', async ({
	page
}) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	// The button stays (the mark travels to the desktop through the cloud), but
	// it must not pretend the bridge is here: both the accessible name and the
	// tooltip carry the caveat.
	const toggle = page.getByRole('button', { name: 'Visible para agentes' });
	await expect(toggle).toHaveAttribute(
		'aria-label',
		'Visible para agentes — solo tiene efecto en la app de escritorio'
	);

	await toggle.hover();
	await expect(page.locator('.cn-tooltip')).toContainText(
		'solo tiene efecto en la app de escritorio'
	);
});

test('off desktop, Settings shows only the muted MCP line (no per-client blocks)', async ({
	page
}) => {
	await openApp(page);
	await page.getByRole('button', { name: 'Configuración' }).click();

	// In the browser isTauriRuntime() is false, so the whole per-client block is
	// hidden and only the single muted line remains.
	await expect(
		page.getByText('La conexión con agentes está disponible solo en la app de escritorio.')
	).toBeVisible();
	await expect(page.getByText('Claude Code')).toHaveCount(0);
	await expect(page.getByText('Añadir a Cursor')).toHaveCount(0);
});
