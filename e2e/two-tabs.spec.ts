import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Dos pestañas de CopyNotes sobre la misma nota (#8 de la revisión del 5/8).
//
// Una sola context = un solo IndexedDB, que es exactamente lo que ven dos
// pestañas del mismo navegador. Antes de esto, la segunda pestaña no se
// enteraba NUNCA de lo que escribía la primera: ni con el tiempo ni al volver a
// ella. Escribir sobre esa copia vieja pisaba el renglón del otro lado sin un
// solo aviso — medido, y acotado al renglón tocado (los renglones nuevos del
// otro lado sobrevivían).

const rows = (page) => page.locator('main [data-block-id] .block-editable');

test('a second tab picks up what the first one wrote, without reloading', async ({ context }) => {
	const a = await context.newPage();
	await openApp(a);
	await a.getByRole('button', { name: 'Nueva nota' }).last().click();
	await a.getByLabel('Título de la nota').fill('Dos pestañas');

	await rows(a).first().click();
	await a.keyboard.type('original', { delay: 25 });
	await a.waitForTimeout(900);

	const b = await context.newPage();
	await openApp(b);
	await b
		.getByRole('navigation', { name: 'Lista de notas' })
		.getByRole('button', { name: 'Dos pestañas', exact: true })
		.click();
	await expect(rows(b).first()).toHaveText('original');

	// La pestaña A escribe. B está abierta y no la toca nadie.
	await a.bringToFront();
	await rows(a).first().click();
	await a.keyboard.press('End');
	await a.keyboard.type(' desde A', { delay: 25 });
	await a.waitForTimeout(900);

	// B lo ve sola, sin recargar y sin que le hagan foco.
	await expect(rows(b).first()).toHaveText('original desde A');

	// Y ahora que B está al día, escribir en ella SUMA en vez de pisar.
	await b.bringToFront();
	await rows(b).first().click();
	await b.keyboard.press('End');
	await b.keyboard.type(' y desde B', { delay: 25 });
	await b.waitForTimeout(900);

	// A tiene el cursor parado en ese mismo renglón, así que NO se lo pisamos: es
	// la regla del renglón protegido, la misma que con la nube. Lo que llegó
	// espera a que el cursor se vaya.
	await expect(rows(a).first()).toHaveText('original desde A');

	// En cuanto el cursor sale de la lista, lo que estaba esperando entra solo.
	await a.bringToFront();
	await a.getByLabel('Título de la nota').click();
	await expect(rows(a).first()).toHaveText('original desde A y desde B');

	// Y lo guardado es una sola versión con las dos ediciones, no la de la última
	// pestaña que escribió.
	await a.reload();
	await a.waitForTimeout(1200);
	await expect(rows(a).first()).toHaveText('original desde A y desde B');
});

test('a row added in one tab appears in the other', async ({ context }) => {
	const a = await context.newPage();
	await openApp(a);
	await a.getByRole('button', { name: 'Nueva nota' }).last().click();
	await a.getByLabel('Título de la nota').fill('Renglón nuevo');

	await rows(a).first().click();
	await a.keyboard.type('uno', { delay: 25 });
	await a.waitForTimeout(900);

	const b = await context.newPage();
	await openApp(b);
	await b
		.getByRole('navigation', { name: 'Lista de notas' })
		.getByRole('button', { name: 'Renglón nuevo', exact: true })
		.click();
	await expect(rows(b)).toHaveCount(1);

	await a.bringToFront();
	await rows(a).first().click();
	await a.keyboard.press('End');
	await a.keyboard.press('Enter');
	await a.waitForTimeout(250);
	await a.keyboard.type('dos', { delay: 25 });
	await a.waitForTimeout(900);

	await expect(rows(b)).toHaveCount(2);
	await expect(rows(b).nth(1)).toHaveText('dos');
});
