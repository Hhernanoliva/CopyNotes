import { test, expect } from '@playwright/test';

// Puerta única: marcar una tarea en el editor pasa por la capa de tareas, que
// deja una línea de bitácora con actor user — visible en Configuración →
// Agentes con el verbo conjugado para "Vos". Seed por IndexedDB nativo
// (mismo patrón que agent-redo.spec: sin imports de la app, la app ya creó la DB).
async function seedTodoNote(page, { noteId, blockId }) {
	await page.evaluate(
		({ noteId, blockId }) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const now = new Date().toISOString();
					const tx = db.transaction(['notes', 'blocks'], 'readwrite');
					tx.objectStore('notes').put({
						id: noteId,
						title: 'Nota con tarea',
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
						content: 'Tarea pendiente',
						html: 'Tarea pendiente',
						order: 0,
						collapsed: false,
						codeCollapsed: false,
						checked: false,
						note: '',
						dueDate: null,
						createdBy: 'user',
						createdAt: now,
						updatedAt: now,
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

test('checking a task in the editor leaves a user done line in the activity feed', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByLabel('Título de la nota')).toBeVisible();

	await seedTodoNote(page, { noteId: 'e2e-user-note', blockId: 'e2e-user-block' });

	await page.reload();
	await expect(page.getByLabel('Título de la nota')).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Lista de notas' })
		.getByRole('button', { name: 'Nota con tarea', exact: true })
		.click();

	const checkbox = page.locator('[role="checkbox"]').first();
	await expect(checkbox).toHaveAttribute('aria-checked', 'false');
	await checkbox.click();
	await expect(checkbox).toHaveAttribute('aria-checked', 'true');

	await page.getByRole('button', { name: 'Configuración' }).click();
	// El feed conjuga para el actor user: "Vos marcaste hecha".
	await expect(page.getByText('marcaste hecha')).toBeVisible();
});
