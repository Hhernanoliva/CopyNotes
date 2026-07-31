import { test, expect } from '@playwright/test';

const CARD = '[aria-label="Descargar la app de escritorio"]';

test('shows the desktop download card on a mouse device and remembers dismissal', async ({
	page
}) => {
	await page.goto('/');
	const card = page.locator(CARD);
	await expect(card).toBeVisible();
	await expect(card.getByText('¿Usás agentes de IA?')).toBeVisible();

	const link = card.getByRole('link', { name: 'Descargar' });
	await expect(link).toHaveAttribute(
		'href',
		'https://github.com/Hhernanoliva/CopyNotes/releases'
	);

	// The old PWA install card must be gone.
	await expect(page.getByText('Instalá CopyNotes')).toHaveCount(0);

	await card.getByRole('button', { name: 'Ahora no' }).click();
	await expect(card).toBeHidden();

	await page.reload();
	await expect(page.locator(CARD)).toHaveCount(0);
});

test('stays hidden on a touch-only device', async ({ browser }) => {
	const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	await page.goto('/');
	await page.waitForSelector('main');
	await expect(page.locator(CARD)).toHaveCount(0);
	await context.close();
});

test('settings offers the download link on the web', async ({ page }) => {
	await page.goto('/');
	await page.locator(CARD).getByRole('button', { name: 'Ahora no' }).click();
	await page.getByRole('button', { name: /configuraci/i }).click();
	const link = page.getByRole('link', { name: 'Descargar la app de escritorio' });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute('href', 'https://github.com/Hhernanoliva/CopyNotes/releases');
});
