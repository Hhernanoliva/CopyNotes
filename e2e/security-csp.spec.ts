import { test, expect } from '@playwright/test';

// The strict CSP (spec 030, phase 0) is configured in vite.config.ts and shipped
// as a <meta> tag in the prerendered HTML, so it guards the web app and the Tauri
// window alike. Its failure mode is silence: a blocked script or font just does
// not happen, with no error visible in the app. This test makes it loud.

test('la app arranca sin violaciones de CSP', async ({ page }) => {
	const violations: string[] = [];
	await page.exposeFunction('__reportCspViolation', (entry: string) => {
		violations.push(entry);
	});
	// addInitScript runs before the page's own scripts, so nothing is missed.
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (event) => {
			// @ts-expect-error injected by exposeFunction above
			window.__reportCspViolation(
				`${event.effectiveDirective} blocked ${event.blockedURI} ${event.sample ?? ''}`.trim()
			);
		});
	});

	await page.goto('/');
	// Exercise the parts that load late: editor, sidebar, a toast.
	await expect(page.getByRole('textbox', { name: 'Título de la nota' })).toBeVisible();
	await page.getByRole('button', { name: 'Snippets' }).click();
	await page.getByRole('button', { name: 'Nuevo snippet' }).click();
	await page.getByRole('textbox', { name: 'Texto', exact: true }).fill('CSP');
	await page.getByRole('button', { name: 'Guardar snippet' }).click();
	await expect(page.getByText('Snippet guardado')).toBeVisible();

	expect(violations).toEqual([]);
});
