import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { createNote, softDeleteNote } from './notes';
import { createBlock } from './blocks';
import { createTag, assignTag, listTagsFor } from './tags';
import { createSnippet } from './snippets';
import { createFolder } from './folders';
import { setShareRole } from './shares';
import { appendActivity, listActivityByBlock } from './activity';
import { setSetting, getSetting } from './settings';
import { KEY } from './settings-registry';
import { dumpAllTables, applyMergePlan, replaceAllTables } from './backup';
import { trackPendingWrite } from './pending-writes';
import { buildBackup } from '../export-import/backup';
import { validateBackup, EXPORTED_FIELDS } from '../export-import/schema';
import { planMerge } from '../export-import/merge';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

const iso = '2026-07-10T12:00:00.000Z';

function emptyTables() {
	return { notes: [], blocks: [], snippets: [], tags: [], tagAssignments: [], settings: [] };
}

describe('dumpAllTables', () => {
	it('returns every table including soft-deleted rows', async () => {
		const kept = await createNote({ title: 'Viva' });
		const gone = await createNote({ title: 'Borrada' });
		await softDeleteNote(gone.id);
		const dump = await dumpAllTables();
		expect(dump.notes.map((note) => note.id).sort()).toEqual([kept.id, gone.id].sort());
		expect(dump.blocks).toEqual([]);
		expect(dump.settings).toEqual([]);
	});

	it('waits for an in-flight write before taking its snapshot', async () => {
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		trackPendingWrite(async () => {
			await gate;
			await db.table('notes').add({
				id: 'note_pending',
				title: 'Último cambio',
				createdAt: iso,
				updatedAt: iso,
				deletedAt: null
			});
		});

		const dumpPromise = dumpAllTables();
		release();
		const dump = await dumpPromise;

		expect(dump.notes.map((note) => note.id)).toContain('note_pending');
	});
});

describe('applyMergePlan', () => {
	it('inserts planned rows and applies settings', async () => {
		const plan = {
			inserts: {
				...emptyTables(),
				notes: [{ id: 'note_1', title: 'Importada', createdAt: iso, updatedAt: iso, deletedAt: null }]
			},
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		};
		delete plan.inserts.settings;
		await applyMergePlan(plan);
		expect((await db.table('notes').get('note_1')).title).toBe('Importada');
		expect(await getSetting('theme')).toBe('dark');
	});

	it('writes nothing if one insert fails', async () => {
		await db.table('notes').add({ id: 'note_dup', title: 'Local', createdAt: iso, updatedAt: iso, deletedAt: null });
		const plan = {
			inserts: {
				...emptyTables(),
				tags: [{ id: 'tag_1', name: 'demo', createdAt: iso, updatedAt: iso, deletedAt: null }],
				notes: [{ id: 'note_dup', title: 'Choque', createdAt: iso, updatedAt: iso, deletedAt: null }]
			},
			settings: []
		};
		delete plan.inserts.settings;
		await expect(applyMergePlan(plan)).rejects.toThrow();
		expect(await db.table('tags').count()).toBe(0);
		expect((await db.table('notes').get('note_dup')).title).toBe('Local');
	});

	it('rolls back imported rows if sidebar normalization fails', async () => {
		const plan = {
			inserts: {
				...emptyTables(),
				notes: [
					// No sortOrder: an old backup's row, which is the case that still
					// forces normalization to write. A row that already has a usable
					// position is left alone now, gap or no gap.
					{
						id: 'note_new',
						title: 'Importada',
						createdAt: iso,
						updatedAt: iso,
						deletedAt: null
					}
				]
			},
			settings: []
		};
		delete plan.inserts.settings;
		const update = vi
			.spyOn(db.table('notes'), 'update')
			.mockRejectedValueOnce(new Error('normalization failed'));

		await expect(applyMergePlan(plan)).rejects.toThrow('normalization failed');

		expect(await db.table('notes').get('note_new')).toBeUndefined();
		update.mockRestore();
	});
});

describe('replaceAllTables', () => {
	it('clears existing data and installs the incoming tables', async () => {
		await createNote({ title: 'Vieja' });
		await setSetting('theme', 'light');
		await replaceAllTables({
			...emptyTables(),
			notes: [{ id: 'note_new', title: 'Nueva', createdAt: iso, updatedAt: iso, deletedAt: null }],
			settings: [{ key: 'theme', value: 'dark', updatedAt: iso }]
		});
		const notes = await db.table('notes').toArray();
		expect(notes).toHaveLength(1);
		expect(notes[0].id).toBe('note_new');
		expect(notes[0].sortOrder).toBe(0);
		expect(await getSetting('theme')).toBe('dark');
	});

	// spec 030 phase 0: the bitácora travels in the backup, so a restore installs
	// the incoming history instead of dropping it on the floor.
	it('replaces prior activity rows with the incoming bitácora', async () => {
		await db.table('activity').add({
			id: 'old',
			blockId: 'b',
			noteId: 'n',
			actor: 'agent',
			action: 'done',
			text: '',
			seq: 0,
			at: iso,
			deletedAt: null
		});
		await replaceAllTables({
			...emptyTables(),
			folders: [],
			activity: [
				{
					id: 'incoming',
					blockId: 'b2',
					noteId: 'n2',
					actor: 'user',
					action: 'done',
					text: '',
					seq: 0,
					at: iso,
					deletedAt: null
				}
			]
		});
		expect((await db.table('activity').toArray()).map((row) => row.id)).toEqual(['incoming']);
	});

	// El interruptor maestro de los agentes NO viaja en el respaldo (no es
	// backupSafe), así que restaurar borraba la tabla de preferencias y lo dejaba
	// en su valor por defecto: los agentes volvían a andar sin que nadie los
	// despausara. La pausa tiene que fallar cerrada, siempre.
	it('keeps this device´s own switches: restoring never un-pauses the agents', async () => {
		await setSetting(KEY.agentsPaused, true);
		await setSetting(KEY.syncConsent, true);
		await setSetting(KEY.theme, 'light');

		await replaceAllTables({
			...emptyTables(),
			settings: [{ key: KEY.theme, value: 'dark', updatedAt: iso }]
		});

		expect(await getSetting(KEY.agentsPaused)).toBe(true);
		expect(await getSetting(KEY.syncConsent)).toBe(true);
		// Lo que sí viaja en el archivo se reemplaza como siempre.
		expect(await getSetting(KEY.theme)).toBe('dark');
	});

	// Un conflicto es "estas dos versiones del renglón X no coinciden". Después de
	// reemplazar todo, ese renglón puede no existir: la decisión quedaría en
	// pantalla apuntando a la nada.
	it('drops pending cloud conflicts, which describe rows that no longer exist', async () => {
		await db.table('conflicts').put({ id: 'notes:vieja', table: 'notes', rowId: 'vieja', at: iso });

		await replaceAllTables({ ...emptyTables(), folders: [] });

		expect(await db.table('conflicts').count()).toBe(0);
	});

	it('clears prior activity when restoring a backup that carries none', async () => {
		await db.table('activity').add({
			id: 'old',
			blockId: 'b',
			noteId: 'n',
			actor: 'agent',
			action: 'done',
			text: '',
			seq: 0,
			at: iso,
			deletedAt: null
		});
		await replaceAllTables({ ...emptyTables(), folders: [] });
		expect(await db.table('activity').count()).toBe(0);
	});
});

describe('backup roundtrip', () => {
	it('export → clear → import restores notes, nested blocks, and tags', async () => {
		const note = await createNote({ title: 'Proyecto' });
		const parent = await createBlock({ noteId: note.id, type: 'bullet', content: 'Padre' });
		await createBlock({
			noteId: note.id,
			parentBlockId: parent.id,
			type: 'todo',
			content: 'Hijo'
		});
		const tag = await createTag({ name: 'demo' });
		await assignTag(tag.id, 'note', note.id);
		await setSetting('theme', 'dark');

		const backup = buildBackup(await dumpAllTables(), {
			appVersion: '0.0.1',
			exportedAt: iso
		});
		const validated = validateBackup(JSON.parse(JSON.stringify(backup)));
		expect(validated.ok).toBe(true);

		await Promise.all(db.tables.map((table) => table.clear()));

		const plan = planMerge(await dumpAllTables(), validated.backup.data);
		await applyMergePlan(plan);

		expect((await db.table('notes').get(note.id)).title).toBe('Proyecto');
		const blocks = await db.table('blocks').where('noteId').equals(note.id).toArray();
		expect(blocks).toHaveLength(2);
		expect(blocks.find((row) => row.content === 'Hijo').parentBlockId).toBe(parent.id);
		const tagsOnNote = await listTagsFor('note', note.id);
		expect(tagsOnNote.map((row) => row.name)).toEqual(['demo']);
		expect(await getSetting('theme')).toBe('dark');
	});

	it('a task history line survives export → clear → import (spec 030 phase 0)', async () => {
		const note = await createNote({ title: 'Proyecto' });
		const task = await createBlock({ noteId: note.id, type: 'todo', content: 'Tarea' });
		await appendActivity({
			blockId: task.id,
			noteId: note.id,
			actor: 'user',
			action: 'done',
			text: 'listo'
		});

		const backup = buildBackup(await dumpAllTables(), { appVersion: '0.0.1', exportedAt: iso });
		const validated = validateBackup(JSON.parse(JSON.stringify(backup)));
		expect(validated.ok).toBe(true);

		await Promise.all(db.tables.map((table) => table.clear()));

		const plan = planMerge(await dumpAllTables(), validated.backup.data);
		await applyMergePlan(plan);

		const history = await listActivityByBlock(task.id);
		expect(history.map((row) => row.text)).toEqual(['listo']);
	});

	// The change counter (spec 030 phase 1) is per-device bookkeeping and is
	// re-stamped when a row is written, so if it travelled inside the file its
	// value would never match the restored row again — and the merge, which
	// compares whole records, would read every single row as a conflict and
	// duplicate the entire database on a second import.
	it('importing the same backup twice adds nothing (spec 030 phase 1)', async () => {
		const note = await createNote({ title: 'Proyecto' });
		const task = await createBlock({ noteId: note.id, type: 'todo', content: 'Tarea' });
		await appendActivity({
			blockId: task.id,
			noteId: note.id,
			actor: 'user',
			action: 'done',
			text: 'listo'
		});

		const backup = buildBackup(await dumpAllTables(), { appVersion: '0.0.1', exportedAt: iso });
		for (const rows of Object.values(backup.data)) {
			for (const row of rows) {
				expect(row.changeSeq).toBe(undefined);
				// Same reasoning, spec 030 phase 3: restored elsewhere, "the server
				// already has this version" is false, and a false claim there is a
				// change that never uploads.
				expect(row.cloudSeq).toBe(undefined);
			}
		}

		const first = planMerge(await dumpAllTables(), backup.data);
		expect(first.summary.conflicts).toBe(0);
		expect(first.summary.notes.added).toBe(0);

		// Same file again over the same database: still nothing to add.
		await applyMergePlan(first);
		const second = planMerge(await dumpAllTables(), backup.data);
		expect(second.summary.conflicts).toBe(0);
		expect(await db.table('notes').count()).toBe(1);
		expect(await db.table('blocks').count()).toBe(1);
	});
});

// EL GUARDIÁN del caño número tres (spec 040, regla 4).
//
// Cada caño de sincronización le agrega campos a las filas, y todos son de este
// aparato: un archivo no puede hacer afirmaciones sobre un servidor. El caño 2
// (compartir) se olvidó de sacar `share` y el archivo se lo llevó puesto; lo
// encontró una persona a mano, semanas después. Esto lo caza en tres segundos.
//
// La siembra tiene que TOCAR TODOS LOS CAÑOS, o el guardián es ciego: por eso está
// `setShareRole` acá, y por eso cada `create*` deja su sello de cambio. Un caño nuevo
// agrega su siembra en esta lista.
// Las dos ayudantes reciben las filas por parámetro y no se las indexa al volcado:
// `Object.entries` las entrega como `unknown` y `svelte-check` no deja leerles ni el
// largo. Un parámetro sin tipo es `any` y acepta un `unknown`, así que la cuenta
// queda en cuatro errores preexistentes y no en siete.
function keysOf(rows) {
	return [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
}

function countOf(rows) {
	return rows.length;
}

describe('lo que un respaldo puede llevar', () => {
	it('un volcado no lleva ninguna clave que no esté declarada', async () => {
		await createFolder('note', 'Carpeta');
		const note = await createNote({ title: 'N' });
		const block = await createBlock({ noteId: note.id, type: 'todo', content: 'x', order: 0 });
		await createSnippet({
			name: 'S',
			content: 'x',
			sourceNoteId: note.id,
			sourceBlockId: block.id
		});
		const tag = await createTag({ name: 't' });
		await assignTag(tag.id, 'note', note.id);
		await appendActivity({ blockId: block.id, noteId: note.id, actor: 'user', action: 'created' });
		await setSetting(KEY.theme, 'dark');
		// Caño 1 (nube cifrada): `changeSeq` y `cloudSeq` los pone el gancho de escritura.
		// Caño 2 (compartir): la marca de por qué caño viaja la nota.
		await setShareRole(note.id, 'owner');

		const dump = await dumpAllTables();

		for (const [table, rows] of Object.entries(dump)) {
			expect(
				countOf(rows),
				`la siembra de ${table} quedó vacía y el guardián no mira nada`
			).toBeGreaterThan(0);
			const declared = new Set(EXPORTED_FIELDS[table]);
			const strays = keysOf(rows).filter((key) => !declared.has(key));
			expect(strays, `claves no declaradas en ${table}`).toEqual([]);
		}
	});
});
