import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote } from './notes';
import { getSetting, setSetting, forgetSharePrefixes } from './settings';
import {
	getShareRole,
	setShareRole,
	sharedNoteIds,
	sharedNoteIdsByRole,
	getShareCursor,
	setShareCursor
} from './shares';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('la marca de compartida', () => {
	it('empieza sin marca y se pone y se saca', async () => {
		const note = await createNote({ title: 'una' });

		expect(await getShareRole(note.id)).toBe(null);

		await setShareRole(note.id, 'owner');
		expect(await getShareRole(note.id)).toBe('owner');

		await setShareRole(note.id, null);
		expect(await getShareRole(note.id)).toBe(null);
	});

	it('separa las que comparto de las que me comparten', async () => {
		const mia = await createNote({ title: 'mía' });
		const ajena = await createNote({ title: 'ajena' });
		await setShareRole(mia.id, 'owner');
		await setShareRole(ajena.id, 'member');

		expect(await sharedNoteIds()).toEqual(new Set([mia.id, ajena.id]));
		const byRole = await sharedNoteIdsByRole();
		expect(byRole.owner).toEqual(new Set([mia.id]));
		expect(byRole.member).toEqual(new Set([ajena.id]));
	});

	it('poner la marca no cuenta como editar la nota', async () => {
		const note = await createNote({ title: 'una' });
		const before = (await db.table('notes').get(note.id)).changeSeq;

		await setShareRole(note.id, 'owner');

		expect((await db.table('notes').get(note.id)).changeSeq).toBe(before);
	});
});

describe('el cursor por nota', () => {
	it('no vive en la fila de la nota, así que no la marca como cambiada', async () => {
		const note = await createNote({ title: 'una' });
		const before = (await db.table('notes').get(note.id)).changeSeq;

		await setShareCursor(note.id, 42);

		expect(await getShareCursor(note.id)).toBe(42);
		expect((await db.table('notes').get(note.id)).changeSeq).toBe(before);
	});

	it('arranca en cero para una nota que nunca bajó nada', async () => {
		expect(await getShareCursor('desconocida')).toBe(0);
	});

	it('no retrocede si llega tarde una tanda vieja', async () => {
		await setShareCursor('n1', 42);
		await setShareCursor('n1', 7);

		expect(await getShareCursor('n1')).toBe(42);
	});
});

describe('olvidar lo compartido', () => {
	it('borra toda la familia con prefijo y no toca las demás preferencias', async () => {
		await setSetting('theme', 'dark');
		await setShareCursor('n1', 10);
		await setShareCursor('n2', 20);

		await forgetSharePrefixes();

		expect(await getShareCursor('n1')).toBe(0);
		expect(await getShareCursor('n2')).toBe(0);
		expect(await getSetting('theme')).toBe('dark');
	});
});
