import { test, expect } from '@playwright/test';
import { openApp } from './app';

// While DESKTOP_RELEASE_PUBLISHED is false (src/lib/desktop/download.ts) there
// is no .app to download, so every download entry point stays hidden. These
// tests assert that hidden state.
//
// When the first release is published and the switch flips to true, restore
// the previous assertions from git history (commit that introduced the
// switch): visible card, "¿Usás agentes de IA?", dismissal remembered across
// reloads, hidden on touch-only devices, and the Settings link.

const CARD = '[aria-label="Descargar la app de escritorio"]';

test('no download card while there is no published release', async ({ page }) => {
	await openApp(page);
	await page.waitForSelector('main');
	await expect(page.locator(CARD)).toHaveCount(0);

	// The old PWA install card must stay gone too.
	await expect(page.getByText('Instalá CopyNotes')).toHaveCount(0);
});

test('settings explains the desktop app without offering a dead link', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: /configuraci/i }).click();
	await expect(
		page.getByText('La conexión con agentes está disponible solo en la app de escritorio.')
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Descargar la app de escritorio' })).toHaveCount(0);
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
