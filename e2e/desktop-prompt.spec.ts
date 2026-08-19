import { test, expect } from '@playwright/test';
import { openApp } from './app';

// DESKTOP_RELEASE_PUBLISHED pasó a true con la v0.2.0 (2026-08-19), así que
// estas pruebas vuelven a afirmar el estado VISIBLE. Mientras el interruptor
// estuvo apagado afirmaban lo contrario — si algún día se apaga de nuevo, hay
// que darlas vuelta, no borrarlas.

const CARD = '[aria-label="Descargar la app de escritorio"]';
const RELEASES = 'https://github.com/Hhernanoliva/CopyNotes/releases';

test('shows the desktop download card on a mouse device and remembers dismissal', async ({
	page
}) => {
	await openApp(page);
	const card = page.locator(CARD);
	await expect(card).toBeVisible();
	await expect(card.getByText('¿Usás agentes de IA?')).toBeVisible();
	await expect(card.getByRole('link', { name: 'Descargar' })).toHaveAttribute('href', RELEASES);

	// The old PWA install card must stay gone.
	await expect(page.getByText('Instalá CopyNotes')).toHaveCount(0);

	await card.getByRole('button', { name: 'Ahora no' }).click();
	await expect(card).toBeHidden();

	await page.reload();
	await expect(page.locator(CARD)).toHaveCount(0);
});

// Pointer, not width: una tablet apaisada es tan ancha como una laptop y sigue
// sin poder instalar una app de escritorio.
test('stays hidden on a touch-only device', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	await openApp(page);
	await expect(page.locator(CARD)).toHaveCount(0);
	await context.close();
});

test('settings offers the download link on the web', async ({ page }) => {
	await openApp(page);
	await page.locator(CARD).getByRole('button', { name: 'Ahora no' }).click();
	await page.getByRole('button', { name: /configuraci/i }).click();
	await expect(
		page.getByText('La conexión con agentes está disponible solo en la app de escritorio.')
	).toBeVisible();
	const link = page.getByRole('link', { name: 'Descargar la app de escritorio' });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute('href', RELEASES);
});

// La versión de CopyNotes, en Configuración. En escritorio ya estaba dentro de
// "Actualizaciones"; en la web y en el celular no había forma de saber qué versión
// tenés, y es el primer dato que hace falta para reportar un problema.
test('settings shows which version of CopyNotes this is', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: /configuraci/i }).click();
	// El número sale del package.json, así que la prueba mira la forma, no el valor:
	// clavarlo acá obligaría a editar el test en cada release.
	await expect(page.getByText(/^CopyNotes \d+\.\d+\.\d+$/)).toBeVisible();
});
