import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { setShareRole, getShareRole } from '../storage/shares';
import { dumpAllTables } from '../storage/backup';
import { buildBackup, validateBackup } from '../export-import';
import { mergeFromShared, sameInAllowList } from './shared-merge';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('una fila que llega se fusiona, no se pisa', () => {
	it('deja intacto todo lo que no viajó, la marca de compartida incluida', async () => {
		const note = await createNote({ title: 'vieja' });
		await db.table('notes').update(note.id, { folderId: 'f1', agentVisible: true, fromCloud: true });
		await setShareRole(note.id, 'owner');

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.title).toBe('nueva');
		expect(stored.folderId).toBe('f1');
		expect(stored.agentVisible).toBe(true);
		expect(stored.sortOrder).toBe(note.sortOrder);
		expect(await getShareRole(note.id)).toBe('owner');
	});

	it('no cuenta como cambio local: queda parada sobre la versión del servidor', async () => {
		const note = await createNote({ title: 'vieja' });

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.changeSeq).toBe(500);
		expect(stored.cloudSeq).toBe(500);
		expect(stored.fromCloud).toBeUndefined();
	});

	it('una nota que llega por primera vez trae los cuatro campos que sólo se crean', async () => {
		await mergeFromShared('notes', { id: 'n-nueva', title: 'del otro', deletedAt: null }, 10);

		const stored = await db.table('notes').get('n-nueva');
		expect(typeof stored.sortOrder).toBe('number');
		expect(stored.folderId).toBe(null);
		expect(stored.agentVisible).toBe(false);
		expect(typeof stored.createdAt).toBe('string');
	});

	it('y no los vuelve a poner cuando la fila ya estaba', async () => {
		const note = await createNote({ title: 'vieja' });
		await db.table('notes').update(note.id, { folderId: 'f1', sortOrder: 7, fromCloud: true });

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.sortOrder).toBe(7);
		expect(stored.folderId).toBe('f1');
	});

	// Encontrado en el gate manual (2026-08-15) con el archivo real de Hernán:
	// "data.blocks.718.collapsed: Invalid key: Expected "collapsed" but received
	// undefined". Un renglón que llegó por el caño compartido a un aparato que no lo
	// tenía quedaba sin los campos que sólo inventa `createBlock`, y el respaldo que
	// ESE aparato exporta deja de pasar su propia validación: el respaldo entero,
	// por un renglón. `birthFields` cubría sólo `notes`.
	it('un renglón que llega nuevo queda completo, y el respaldo del aparato sigue siendo válido', async () => {
		const note = await createNote({ title: 'compartida' });
		await mergeFromShared(
			'blocks',
			{
				id: 'b-del-otro',
				noteId: note.id,
				parentBlockId: null,
				order: 1,
				type: 'text',
				content: 'lo escribió el otro',
				html: 'lo escribió el otro',
				checked: false,
				deletedAt: null
			},
			10
		);

		const stored = await db.table('blocks').get('b-del-otro');
		expect(stored.collapsed).toBe(false);
		expect(stored.checked).toBe(false);
		expect(typeof stored.createdAt).toBe('string');
		expect(typeof stored.updatedAt).toBe('string');

		const backup = buildBackup(await dumpAllTables(), {
			appVersion: '0.2.0',
			exportedAt: new Date().toISOString()
		});
		expect(validateBackup(backup).ok).toBe(true);
	});

	// La misma falla por la otra puerta: una lápida viaja con TRES campos, así que
	// una fila que llega ya borrada sin haber existido nunca acá llega más pelada
	// todavía. También tiene que dejar un respaldo válido.
	it('una fila que llega ya borrada tampoco arruina el respaldo', async () => {
		await mergeFromShared('notes', { id: 'n-muerta', updatedAt: new Date().toISOString(), deletedAt: new Date().toISOString() }, 20);
		await mergeFromShared('blocks', { id: 'b-muerto', noteId: 'n-muerta', deletedAt: new Date().toISOString() }, 21);
		await mergeFromShared(
			'activity',
			{ id: 'a-muerta', noteId: 'n-muerta', blockId: 'b-muerto', deletedAt: new Date().toISOString() },
			22
		);

		const backup = buildBackup(await dumpAllTables(), {
			appVersion: '0.2.0',
			exportedAt: new Date().toISOString()
		});
		expect(validateBackup(backup).ok).toBe(true);
	});

	it('limpia el marcado de lo que llega', async () => {
		await mergeFromShared(
			'blocks',
			{
				id: 'b1',
				noteId: 'n1',
				type: 'todo',
				content: 'hola',
				html: '<img src=x onerror="y()">hola'
			},
			10
		);

		expect((await db.table('blocks').get('b1')).html).not.toContain('onerror');
	});
});

describe('comparar sólo lo que se mandó', () => {
	it('una carpeta local contra una ausente NO es un desacuerdo', () => {
		const local = { id: 'n1', title: 'T', deletedAt: null, folderId: 'f1', sortOrder: 3 };
		expect(sameInAllowList('notes', local, { id: 'n1', title: 'T', deletedAt: null })).toBe(true);
	});

	it('un título distinto sí lo es', () => {
		const local = { id: 'n1', title: 'T', deletedAt: null, folderId: 'f1' };
		expect(sameInAllowList('notes', local, { id: 'n1', title: 'otro', deletedAt: null })).toBe(
			false
		);
	});
});
