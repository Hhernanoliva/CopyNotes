import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { appendActivity } from '../storage/activity';
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
		await appendActivity({ blockId: 'b1', noteId: note.id, actor: 'user', action: 'done', text: '' });

		expect(await countSharedPending()).toBe(1);
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

	// Encontrado en el gate manual del 2026-08-14: la edición del otro aparato
	// llegaba a la base y la pantalla no se enteraba. `appliedVersion` —la única
	// campanita que dice "refrescá"— la tocaba sólo el caño cifrado, y este
	// número es lo que ahora la toca.
	it('cuenta las filas que CAMBIARON algo, no las que vinieron', async () => {
		const note = await createNote({ title: 'vieja' });
		await setShareRole(note.id, 'owner');
		const stored = await db.table('notes').get(note.id);
		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					// La misma que ya está acá: es lo que devuelve la ventana de
					// relectura en cada pasada, incluidas las filas propias.
					{
						table_name: 'notes',
						id: note.id,
						change_seq: stored.changeSeq,
						deleted: false,
						payload: { id: note.id, title: 'vieja', deletedAt: null },
						author_id: 'u1',
						server_seq: 5
					},
					{
						table_name: 'notes',
						id: note.id,
						change_seq: stored.changeSeq + 1,
						deleted: false,
						payload: { id: note.id, title: 'nueva', deletedAt: null },
						author_id: 'u1',
						server_seq: 6
					}
				],
				error: null
			})
		};

		expect(await pullSharedNote(client, note.id)).toBe(1);
	});

	it('una pasada de puro eco no despierta a nadie', async () => {
		const note = await createNote({ title: 'igual' });
		await setShareRole(note.id, 'owner');
		const stored = await db.table('notes').get(note.id);
		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						table_name: 'notes',
						id: note.id,
						change_seq: stored.changeSeq,
						deleted: false,
						payload: { id: note.id, title: 'igual', deletedAt: null },
						author_id: 'u1',
						server_seq: 9
					}
				],
				error: null
			})
		};

		expect(await pullSharedNote(client, note.id)).toBe(0);
		expect(await getShareCursor(note.id)).toBe(9);
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
