import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { createNote, softDeleteNote, updateNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { appendActivity } from '../storage/activity';
import { assignTag, createTag } from '../storage/tags';
import { setShareRole } from '../storage/shares';
import {
	countAllPending,
	countPendingUploads,
	grantUploadConsent,
	hasUploadConsent,
	listPendingUploads,
	markUploadedThrough,
	uploadedThrough
} from './pending';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('consent', () => {
	it('is off until the user gives it', async () => {
		expect(await hasUploadConsent()).toBe(false);

		await grantUploadConsent();

		expect(await hasUploadConsent()).toBe(true);
	});

	it('holds back everything while it is off, however much changed', async () => {
		const note = await createNote({ title: 'privada' });
		await createBlock({ noteId: note.id, content: 'texto' });

		expect(await listPendingUploads()).toEqual([]);
	});
});

describe('what is still pending', () => {
	it('lists every changed record once consent is given, oldest change first', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		const block = await createBlock({ noteId: note.id, content: 'texto' });

		const pending = await listPendingUploads();

		expect(pending.map((entry) => entry.table)).toEqual(['notes', 'blocks']);
		expect(pending.map((entry) => entry.row.id)).toEqual([note.id, block.id]);
		expect(pending[0].row.changeSeq).toBeLessThan(pending[1].row.changeSeq);
	});

	it('drops what was already uploaded and keeps what changed after', async () => {
		await grantUploadConsent();
		const old = await createNote({ title: 'vieja' });
		const uploaded = (await db.table('notes').get(old.id)).changeSeq;
		await markUploadedThrough(uploaded);

		expect(await listPendingUploads()).toEqual([]);

		await updateNote(old.id, { title: 'editada' });

		const pending = await listPendingUploads();
		expect(pending).toHaveLength(1);
		expect(pending[0].row.title).toBe('editada');
	});

	it('includes a deletion, so it can travel as a tombstone', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'se va' });
		await markUploadedThrough((await db.table('notes').get(note.id)).changeSeq);

		await softDeleteNote(note.id);

		const pending = await listPendingUploads();
		expect(pending.map((entry) => entry.row.id)).toContain(note.id);
		expect(pending.find((entry) => entry.row.id === note.id).row.deletedAt).not.toBe(null);
	});

	it('never moves the uploaded mark backwards', async () => {
		await markUploadedThrough(500);
		await markUploadedThrough(100);

		expect(await uploadedThrough()).toBe(500);
	});

	it('honours a batch size, taking the oldest changes first', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		for (const content of ['uno', 'dos', 'tres']) {
			await createBlock({ noteId: note.id, content });
		}

		const batch = await listPendingUploads({ limit: 2 });

		expect(batch).toHaveLength(2);
		expect(batch[0].table).toBe('notes');
		expect(batch[1].row.content).toBe('uno');
	});

	it('leaves the vault key and the preferences out of what travels', async () => {
		await grantUploadConsent();
		await createNote({ title: 'una' });

		const tables = new Set((await listPendingUploads()).map((entry) => entry.table));

		expect(tables.has('vault')).toBe(false);
		expect(tables.has('settings')).toBe(false);
	});
});

describe('una nota viaja por un caño solo', () => {
	it('deja afuera las tres tablas de una nota compartida y NO la cuarta', async () => {
		await grantUploadConsent();
		const shared = await createNote({ title: 'compartida' });
		const own = await createNote({ title: 'mía' });
		await createBlock({ noteId: shared.id, content: 'de la compartida' });
		await createBlock({ noteId: own.id, content: 'de la mía' });
		await appendActivity({
			blockId: 'b-x',
			noteId: shared.id,
			actor: 'user',
			action: 'done',
			text: ''
		});
		const tag = await createTag({ name: 'etiqueta' });
		await assignTag(tag.id, 'note', shared.id);
		await setShareRole(shared.id, 'owner');

		const pending = await listPendingUploads();
		const ids = new Set(pending.map((entry) => entry.row.id));

		expect(ids.has(shared.id)).toBe(false);
		expect(ids.has(own.id)).toBe(true);
		expect(pending.some((entry) => entry.table === 'blocks' && entry.row.noteId === shared.id)).toBe(
			false
		);
		expect(
			pending.some((entry) => entry.table === 'activity' && entry.row.noteId === shared.id)
		).toBe(false);
		// Las etiquetas son la organización privada del dueño: viajan por el caño
		// cifrado o el segundo aparato pierde las etiquetas de todo lo que comparta.
		expect(pending.some((entry) => entry.table === 'tagAssignments')).toBe(true);
	});

	it('el conteo cuenta lo mismo que la lista', async () => {
		await grantUploadConsent();
		const shared = await createNote({ title: 'compartida' });
		await createBlock({ noteId: shared.id, content: 'texto' });
		await setShareRole(shared.id, 'owner');

		expect(await countPendingUploads()).toBe((await listPendingUploads()).length);
	});

	// El número que ve la persona son DOS colas sumadas, y el invitado sólo tiene
	// la segunda: `countPendingUploads` arranca en cero sin permiso de subir, y un
	// invitado no da ese permiso (no tiene bóveda ni notas propias en la nube).
	// Estaba escrito en `upload.ts` y en `SettingsDialog` por separado, y el
	// segundo se quedó con la mitad: abrir Configuración bajaba el número a cero
	// hasta la pasada siguiente. Una suma, un solo lugar (gate manual 2026-08-17).
	it('la cola del invitado cuenta aunque no haya permiso de subir', async () => {
		const ajena = await createNote({ title: 'me la compartieron' });
		await setShareRole(ajena.id, 'member');
		await appendActivity({
			blockId: 'b1',
			noteId: ajena.id,
			actor: 'user',
			action: 'done',
			text: ''
		});

		expect(await countPendingUploads()).toBe(0);
		expect(await countAllPending()).toBe(1);
	});
});
