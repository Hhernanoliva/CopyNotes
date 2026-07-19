import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Stage 7 of spec 025's Tauri roadmap: a backup created by the PWA must import
// cleanly into the desktop container. WebKit is the faithful proxy here because
// Tauri on macOS embeds the same engine family as Safari. Two isolated browser
// contexts stand in for the two separate storage containers (PWA vs desktop):
// the first exports, the second imports into its own empty IndexedDB.

async function readJsonDownload(download) {
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('a PWA backup imports into a fresh desktop container', async ({ browser }) => {
	const marker = `Migración Mac ${Date.now()}`;
	const blockText = 'Texto que viaja de la PWA al escritorio';

	// Phase 1 — the PWA exports a real backup.
	const pwa = await browser.newContext();
	const pwaPage = await pwa.newPage();
	await pwaPage.goto('/');
	await pwaPage.getByRole('button', { name: 'Nueva nota' }).click();
	await pwaPage.getByLabel('Título de la nota').fill(marker);
	const pwaBlock = pwaPage.locator('main [data-block-id] .block-editable').first();
	await expect(pwaBlock).toBeVisible();
	await pwaBlock.fill(blockText);

	await pwaPage.getByRole('button', { name: 'Respaldo' }).click();
	const [download] = await Promise.all([
		pwaPage.waitForEvent('download'),
		pwaPage.getByRole('button', { name: /Descargar respaldo completo/ }).click()
	]);
	const backup = await readJsonDownload(download);
	expect(backup.exportedBy.source).toBe('pwa');
	expect(backup.data.notes.some((row) => row.title === marker)).toBe(true);

	const dir = await mkdtemp(join(tmpdir(), 'copynotes-backup-'));
	const backupPath = join(dir, 'copynotes-backup.json');
	await writeFile(backupPath, JSON.stringify(backup), 'utf8');
	await pwa.close();

	// Phase 2 — a fresh desktop-like container imports that file.
	const desktop = await browser.newContext();
	const deskPage = await desktop.newPage();
	await deskPage.goto('/');
	// The imported note does not exist here yet.
	await expect(deskPage.getByText(marker)).toHaveCount(0);

	await deskPage.getByRole('button', { name: 'Respaldo' }).click();
	const [chooser] = await Promise.all([
		deskPage.waitForEvent('filechooser'),
		deskPage.getByRole('button', { name: /Elegir archivo de respaldo/ }).click()
	]);
	await chooser.setFiles(backupPath);

	// Review step confirms it is a valid CopyNotes backup, then merge-import.
	await expect(deskPage.getByText(/es un respaldo válido de CopyNotes/)).toBeVisible();
	await deskPage.getByRole('button', { name: /Importar y conservar lo mío/ }).click();

	// The imported note is now on screen in the desktop container.
	await expect(deskPage.getByText(marker).first()).toBeVisible();

	// And it survives a reload, proving it landed in this container's IndexedDB.
	await deskPage.reload();
	await expect(deskPage.getByText(marker).first()).toBeVisible();

	await desktop.close();
});
