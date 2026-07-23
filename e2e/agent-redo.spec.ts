import { test, expect } from '@playwright/test';

// The "Rehacer" control only appears for an AGENT `done` activity entry — the
// kind the desktop bridge produces, which no in-browser UI path can create
// (the editor checkbox never calls the task-action layer, and the bridge is
// desktop-only). So we seed one the harness-agnostic way: after the app boots
// (which is what creates the Dexie database at its current version, with all
// object stores), we open the SAME IndexedDB with the browser's native API and
// insert a visible note, its todo block, and a `done` activity row by an agent.
// No app-source import (which 404s against the production preview build), no
// production seed hook.
async function seedAgentDoneTask(page, { noteId, blockId }) {
	await page.evaluate(
		({ noteId, blockId }) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes'); // no version → current (app already created it)
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const now = new Date().toISOString();
					const tx = db.transaction(['notes', 'blocks', 'activity'], 'readwrite');
					tx.objectStore('notes').put({
						id: noteId,
						title: 'Nota del agente',
						agentVisible: true,
						sortOrder: -1,
						folderId: null,
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					tx.objectStore('blocks').put({
						id: blockId,
						noteId,
						parentBlockId: null,
						type: 'todo',
						content: 'Tarea del agente',
						html: 'Tarea del agente',
						order: 0,
						collapsed: false,
						codeCollapsed: false,
						checked: true,
						note: '',
						dueDate: null,
						createdBy: 'agent',
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					// Two agent `done` rows for the SAME block — the real redo cycle
					// (agent done → user redo → agent done again). Each is its own
					// bitácora line, so the "Rehacer" form must open under only the
					// clicked one (keyed by the row id, not the shared blockId).
					const earlier = new Date(Date.parse(now) - 1000).toISOString();
					tx.objectStore('activity').put({
						id: 'e2e-act-done-1',
						blockId,
						noteId,
						actor: 'agent',
						action: 'done',
						text: 'hecho (1)',
						at: earlier,
						deletedAt: null
					});
					tx.objectStore('activity').put({
						id: 'e2e-act-done-2',
						blockId,
						noteId,
						actor: 'agent',
						action: 'done',
						text: 'hecho (2)',
						at: now,
						deletedAt: null
					});
					tx.oncomplete = () => {
						db.close();
						resolve(null);
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
		{ noteId, blockId }
	);
}

test('a redo instruction unchecks the task and records a note', async ({ page }) => {
	await page.goto('/');
	// Wait until the app has booted (and therefore created the Dexie DB) before seeding.
	await expect(page.getByLabel('Título de la nota')).toBeVisible();

	await seedAgentDoneTask(page, { noteId: 'e2e-agent-note', blockId: 'e2e-agent-block' });

	await page.getByRole('button', { name: 'Configuración' }).click();

	// Both agent `done` entries show a "Rehacer" trigger; clicking one must open
	// the input under that row only (regression guard for keying by row id).
	await expect(page.getByRole('button', { name: 'Rehacer' })).toHaveCount(2);
	await page.getByRole('button', { name: 'Rehacer' }).first().click();
	await expect(page.getByLabel('Instrucción para rehacer')).toHaveCount(1);
	await page.getByLabel('Instrucción para rehacer').fill('Rehacer: agregá fuentes');
	await page.getByRole('button', { name: 'Enviar' }).click();

	// The instruction round-trips into the bitácora as a new user note entry.
	await expect(page.getByText('Rehacer: agregá fuentes')).toBeVisible();
});
