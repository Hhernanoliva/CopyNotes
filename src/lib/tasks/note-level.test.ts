import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, createBlock, listActivityByBlock, listActivityByNote } from '$lib/storage';
import { markNoteDone } from './actions';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

// "Listo" es una declaración sobre la NOTA, no sobre un renglón (spec 038 §8).
// No es una máquina de estados: no hay aprobación, no hay reapertura, no hay
// estado que consultar. El dueño la lee como una línea más.
describe('markNoteDone', () => {
	it('deja una entrada de la nota entera, sin renglón', async () => {
		const nota = await createNote();

		await markNoteDone({ noteId: nota.id, actor: 'member:u-1', text: 'falta la factura' });

		expect((await listActivityByNote(nota.id)).at(-1)).toMatchObject({
			blockId: null,
			action: 'listo',
			actor: 'member:u-1',
			text: 'falta la factura'
		});
	});

	it('sin aclaración también vale', async () => {
		const nota = await createNote();

		await markNoteDone({ noteId: nota.id, actor: 'member:u-1' });

		expect((await listActivityByNote(nota.id)).at(-1).text).toBe('');
	});

	// `blockId: null` no es una clave válida de IndexedDB, así que la fila queda
	// FUERA del índice `blockId` y se lee por nota. Eso es lo que se quiere, pero
	// parece un descuido, así que está medido: la itálica de un renglón no la
	// levanta ni por accidente.
	it('no aparece colgada de ningún renglón', async () => {
		const nota = await createNote();
		const block = await createBlock({ noteId: nota.id, type: 'todo', content: 'llamar' });

		await markNoteDone({ noteId: nota.id, actor: 'member:u-1' });

		expect(await listActivityByBlock(block.id)).toEqual([]);
		expect((await listActivityByNote(nota.id)).some((fila) => fila.action === 'listo')).toBe(true);
	});

	it('queda pendiente de subir, como cualquier línea del invitado', async () => {
		const nota = await createNote();

		await markNoteDone({ noteId: nota.id, actor: 'member:u-1' });

		expect((await listActivityByNote(nota.id)).at(-1).cloudSeq).toBeUndefined();
	});

	// Es la única acción que escribe UNA fila y ninguna otra, así que la red de
	// seguridad de `updateBlock` nunca se dispara: sin este aviso explícito, el
	// archivo que leen los agentes se queda viejo.
	it('avisa que los datos del agente cambiaron', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const nota = await createNote();
		const antes = agentData.version;

		await markNoteDone({ noteId: nota.id, actor: 'member:u-1' });

		expect(agentData.version).toBeGreaterThan(antes);
	});
});

// El respaldo ya tolera una entrada de nota entera, y lo hace por adelantado
// (`3e42b5e`): `activity.blockId` es `v.nullable(v.string())` y
// `dropDanglingActivity` no trata el nulo como un renglón que falta. Esas
// pruebas arman la fila A MANO; ésta usa la que `markNoteDone` escribe de
// verdad, que es el único eslabón que aquéllas no pueden ver.
//
// Si se pone roja, NO hay que arreglar el "Listo": hay que mirar si
// `activitySchema.blockId` sigue siendo nullable y si la limpieza sigue
// salteando el nulo.
describe('el "Listo" sobrevive a un respaldo', () => {
	it('la fila real que escribe markNoteDone se exporta y valida', async () => {
		const { buildBackup } = await import('$lib/export-import/backup');
		const { validateBackup } = await import('$lib/export-import/schema');
		const nota = await createNote();
		await markNoteDone({ noteId: nota.id, actor: 'member:u-1', text: 'falta la factura' });

		const archivo = buildBackup(
			{
				notes: await db.table('notes').toArray(),
				blocks: [],
				activity: await db.table('activity').toArray(),
				snippets: [],
				tags: [],
				tagAssignments: [],
				settings: []
			},
			{ appVersion: '0.0.1', exportedAt: '2026-08-17T12:00:00.000Z' }
		);

		const resultado = validateBackup(archivo);
		expect(resultado.ok).toBe(true);
		// Y sobrevive a la limpieza de entradas huérfanas, que es donde una fila sin
		// renglón se cae si alguien "simplifica" la guardia del nulo.
		expect(resultado.backup.data.activity.some((fila) => fila.action === 'listo')).toBe(true);
		expect(resultado.warnings).toEqual([]);
	});
});
