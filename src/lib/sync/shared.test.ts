import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { setShareRole, getShareRole, getShareCursor } from '../storage/shares';
import {
	listSharedPending,
	countSharedPending,
	pullSharedNote,
	pushSharedNote,
	reconcileShares
} from './shared';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('qué ofrece el caño compartido', () => {
	it('no ofrece nada de una nota que no está compartida', async () => {
		const note = await createNote({ title: 'mía' });
		await createBlock({ noteId: note.id, content: 'texto' });

		expect(await listSharedPending(note.id, null)).toEqual([]);
	});

	it('ofrece las tres tablas de la nota del dueño', async () => {
		const note = await createNote({ title: 'compartida' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await setShareRole(note.id, 'owner');

		const pending = await listSharedPending(note.id, 'owner');

		expect(new Set(pending.map((entry) => entry.table))).toEqual(new Set(['notes', 'blocks']));
	});

	it('del invitado ofrece SÓLO la bitácora', async () => {
		const note = await createNote({ title: 'ajena' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await setShareRole(note.id, 'member');

		const pending = await listSharedPending(note.id, 'member');

		expect(pending.every((entry) => entry.table === 'activity')).toBe(true);
	});

	it('no necesita ni permiso de subir ni bóveda para tener cola', async () => {
		// Ni `grantUploadConsent()` ni una llave: un invitado que nunca consintió
		// subir sus notas y nunca creó una bóveda tiene que poder contestar igual.
		const note = await createNote({ title: 'ajena' });
		await setShareRole(note.id, 'member');

		expect(await countSharedPending()).toBeGreaterThanOrEqual(0);
	});
});

describe('la subida por nota', () => {
	it('anota como enviada la fila que el servidor aceptó, y no la que rechazó', async () => {
		const note = await createNote({ title: 'compartida' });
		const block = await createBlock({ noteId: note.id, content: 'texto' });
		await setShareRole(note.id, 'owner');
		const client = {
			rpc: vi
				.fn()
				.mockResolvedValue({ data: [{ rejected_table: 'blocks', rejected_id: block.id }], error: null })
		};

		const accepted = await pushSharedNote(client, note.id, 'owner');

		expect(accepted).toBe(1);
		const storedNote = await db.table('notes').get(note.id);
		expect(storedNote.cloudSeq).toBe(storedNote.changeSeq);
		const storedBlock = await db.table('blocks').get(block.id);
		expect(storedBlock.cloudSeq).toBeUndefined();
	});
});

describe('la bajada por nota', () => {
	it('aplica lo que llega y guarda el cursor, sin tocar el sello de la nota', async () => {
		const note = await createNote({ title: 'vieja' });
		await setShareRole(note.id, 'owner');
		const before = (await db.table('notes').get(note.id)).changeSeq;
		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						table_name: 'notes',
						id: note.id,
						change_seq: before + 10,
						deleted: false,
						payload: { id: note.id, title: 'nueva', deletedAt: null },
						author_id: 'u1',
						server_seq: 7
					}
				],
				error: null
			})
		};

		await pullSharedNote(client, note.id);

		expect((await db.table('notes').get(note.id)).title).toBe('nueva');
		expect(await getShareCursor(note.id)).toBe(7);
	});

	it('una pasada que sólo movió el cursor no encola ninguna subida', async () => {
		const note = await createNote({ title: 'una' });
		await setShareRole(note.id, 'owner');
		const before = (await db.table('notes').get(note.id)).changeSeq;
		const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };

		await pullSharedNote(client, note.id);

		expect((await db.table('notes').get(note.id)).changeSeq).toBe(before);
	});
});

describe('en qué estoy', () => {
	it('el servidor manda: pone la marca que falta y saca la que sobra', async () => {
		const cerrada = await createNote({ title: 'ya no se comparte' });
		const nueva = await createNote({ title: 'me la compartieron' });
		await setShareRole(cerrada.id, 'owner');
		const client = {
			rpc: vi.fn().mockResolvedValue({ data: [{ note_id: nueva.id, role: 'member' }], error: null })
		};

		await reconcileShares(client);

		expect(await getShareRole(cerrada.id)).toBe(null);
		expect(await getShareRole(nueva.id)).toBe('member');
	});
});
