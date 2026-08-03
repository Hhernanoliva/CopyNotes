// The download half against a fake server (spec 030 phase 3). What is under test
// is the merge policy, one branch at a time: what comes down must never quietly
// replace something written here.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote, updateNote } from '../storage/notes';
import { encryptRecord } from './records';
import { createVault, getVaultKey } from './vault';
import { grantUploadConsent, listPendingUploads, markUploadedThrough } from './pending';

// Node has no localStorage and the change counter mirrors its high-water mark
// there.
const store = new Map();
globalThis.localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => {
		store.set(key, String(value));
	},
	removeItem: (key) => {
		store.delete(key);
	},
	clear: () => store.clear(),
	key: (index) => [...store.keys()][index] ?? null,
	get length() {
		return store.size;
	}
};

// What the fake server holds, newest last, plus an optional failure to inject.
const server = vi.hoisted(() => ({ rows: [], error: null }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		from: () => {
			// The real builder is a thenable; every chain in download.ts ends at
			// `.limit()`, so that is where this one resolves.
			let cursor = 0;
			const query = {
				select: () => query,
				gt: (_column, value) => {
					cursor = value;
					return query;
				},
				order: () => query,
				limit: async (max) =>
					server.error
						? { data: null, error: server.error }
						: { data: server.rows.filter((row) => row.server_seq > cursor).slice(0, max), error: null }
			};
			return query;
		}
	})
}));

const { downloadOnce, downloadedThrough } = await import('./download');

const note = (overrides) => ({
	id: 'nota-compartida',
	title: 'De la otra máquina',
	sortOrder: 0,
	folderId: null,
	agentVisible: false,
	createdAt: '2026-07-30T10:00:00.000Z',
	updatedAt: '2026-07-30T10:00:00.000Z',
	deletedAt: null,
	...overrides
});

// A row as the server stores it: encrypted with the real vault key, so these
// tests exercise the same path the app does.
async function publish(row, { table = 'notes', changeSeq, serverSeq }) {
	const payload = await encryptRecord(await getVaultKey(), table, { ...row, changeSeq });
	server.rows.push({
		table_name: payload.table,
		id: payload.id,
		change_seq: payload.changeSeq,
		deleted: payload.deleted,
		iv: payload.iv,
		blob: payload.blob,
		server_seq: serverSeq
	});
}

beforeEach(async () => {
	server.rows = [];
	server.error = null;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
	await createVault();
});

describe('what arrives from the other device', () => {
	it('lands here, and does not bounce straight back up', async () => {
		await publish(note({ title: 'Escrita allá' }), { changeSeq: 1_700_000_000_000, serverSeq: 1 });

		const result = await downloadOnce();

		expect(result.applied).toBe(1);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('Escrita allá');
		expect(await listPendingUploads()).toEqual([]);
		expect(await downloadedThrough()).toBe(1);
	});

	it('deletes here what was deleted there', async () => {
		await publish(note({ deletedAt: null }), { changeSeq: 1_700_000_000_000, serverSeq: 1 });
		await downloadOnce();

		await publish(note({ deletedAt: '2026-07-30T11:00:00.000Z' }), {
			changeSeq: 1_700_000_000_001,
			serverSeq: 2
		});
		await downloadOnce();

		expect((await db.table('notes').get('nota-compartida')).deletedAt).toBe(
			'2026-07-30T11:00:00.000Z'
		);
	});

	it('ignores the echo of what this device just uploaded', async () => {
		const mine = await createNote({ title: 'mía' });
		const stored = await db.table('notes').get(mine.id);
		await markUploadedThrough(stored.changeSeq);
		await publish(stored, { changeSeq: stored.changeSeq, serverSeq: 1 });

		const result = await downloadOnce();

		expect(result.applied).toBe(0);
		expect((await db.table('notes').get(mine.id)).title).toBe('mía');
	});

	it('writes down that the server holds it, so a lost reply cannot strand it for ever', async () => {
		// The upload landed but the answer never came back — a dropped wifi between
		// the write and the reply. This device still believes nothing of its own is
		// up there, so its next attempt declares "this record is new", and the
		// server refuses it because it plainly is not. Without noticing the echo,
		// that refusal repeats on every sync and the record never syncs again.
		const mine = await createNote({ title: 'mía' });
		const stored = await db.table('notes').get(mine.id);
		expect(stored.cloudSeq).toBeUndefined();
		await publish(stored, { changeSeq: stored.changeSeq, serverSeq: 1 });

		await downloadOnce();

		expect((await db.table('notes').get(mine.id)).cloudSeq).toBe(stored.changeSeq);
		expect(await listPendingUploads()).toEqual([]);
	});

	it('trae la elección de la otra máquina aunque su versión sea más vieja', async () => {
		// El caso real, y el que rompía: este aparato editó SEGUNDO y subió bien;
		// el otro tenía su edición anterior sin subir, le salió el aviso de las dos
		// versiones y la persona eligió "quedarme con el mío". Esa elección sube
		// declarando NUESTRA versión como base, así que el servidor la acepta: la
		// versión de allá es la sucesora aunque su número de cambio —derivado del
		// reloj de ESE aparato— sea más bajo que el nuestro. Comparando los dos
		// números la dábamos por vieja y acá no cambiaba nada.
		await publish(note({ title: 'lo mío, subido' }), {
			changeSeq: 1_700_000_000_010,
			serverSeq: 1
		});
		await downloadOnce();

		await publish(note({ title: 'lo del otro, elegido a mano' }), {
			changeSeq: 1_700_000_000_005,
			serverSeq: 2
		});
		const result = await downloadOnce();

		expect(result.applied).toBe(1);
		expect((await db.table('notes').get('nota-compartida')).title).toBe(
			'lo del otro, elegido a mano'
		);
		// Y no rebota: nada queda pendiente de volver a subir.
		expect(await listPendingUploads()).toEqual([]);
	});
});

describe('cuando el servidor confirma dos escrituras en desorden', () => {
	it('vuelve a mirar el tramo final, así un número que llegó tarde no se pierde', async () => {
		// Postgres reparte el número al EMPEZAR la escritura, no al confirmarla:
		// con dos aparatos subiendo a la vez, la 101 puede quedar visible antes que
		// la 100. Mirando sólo hacia adelante, la 100 no se pedía nunca más y ese
		// cambio no llegaba a este aparato hasta que alguien volviera a tocarlo.
		await publish(note({ id: 'llegó-primero', title: 'la 101' }), {
			changeSeq: 1_700_000_000_000,
			serverSeq: 101
		});
		await downloadOnce();
		expect(await downloadedThrough()).toBe(101);

		// La que venía escribiéndose desde antes recién ahora se ve.
		await publish(note({ id: 'confirmó-después', title: 'la 100' }), {
			changeSeq: 1_700_000_000_001,
			serverSeq: 100
		});
		const result = await downloadOnce();

		expect(result.applied).toBe(1);
		expect((await db.table('notes').get('confirmó-después')).title).toBe('la 100');
		// Y la marca no retrocede por haber vuelto a mirar hacia atrás.
		expect(await downloadedThrough()).toBe(101);
	});

	it('releer la versión sobre la que estoy escribiendo no inventa un conflicto', async () => {
		// Bajé la versión de allá, la edité acá y todavía no subí. Al releer el
		// tramo final vuelve a pasar esa MISMA versión: es la base de lo que estoy
		// por subir, no una discusión. Contarla como conflicto sacaba un aviso de
		// "dos versiones" contra el propio punto de partida.
		await publish(note({ title: 'la de allá' }), { changeSeq: 1_700_000_000_000, serverSeq: 4 });
		await downloadOnce();
		await updateNote('nota-compartida', { title: 'lo que escribí encima' });

		const result = await downloadOnce();

		expect(result.conflicts).toBe(0);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('lo que escribí encima');
		expect(await listPendingUploads()).toHaveLength(1);
	});

	it('lo que ya se aplicó no se vuelve a escribir ni rebota para arriba', async () => {
		// El precio de mirar hacia atrás es releer lo mismo en cada pasada. Tiene
		// que salir gratis: ni escrituras repetidas ni nada volviendo a la cola.
		await publish(note({ title: 'una sola vez' }), { changeSeq: 1_700_000_000_000, serverSeq: 9 });
		await downloadOnce();

		const result = await downloadOnce();

		expect(result.received).toBe(1);
		expect(result.applied).toBe(0);
		expect(await db.table('notes').count()).toBe(1);
		expect(await listPendingUploads()).toEqual([]);
	});
});

describe('when both devices touched the same record', () => {
	it('keeps what is written here and counts a conflict instead of overwriting', async () => {
		await publish(note({ title: 'versión de allá' }), {
			changeSeq: 1_700_000_000_000,
			serverSeq: 1
		});
		await downloadOnce();
		// Edited here and not uploaded yet.
		await updateNote('nota-compartida', { title: 'versión mía sin subir' });

		await publish(note({ title: 'versión de allá, más nueva' }), {
			changeSeq: 1_900_000_000_000,
			serverSeq: 2
		});
		const result = await downloadOnce();

		expect(result.conflicts).toBe(1);
		expect(result.applied).toBe(0);
		expect((await db.table('notes').get('nota-compartida')).title).toBe('versión mía sin subir');
		// And the local edit is still on its way up: a conflict blocks nothing.
		expect(await listPendingUploads()).toHaveLength(1);
	});
});

describe('when the server or the network fails', () => {
	it('leaves the cursor where it was, so the batch is read again', async () => {
		await publish(note({}), { changeSeq: 1_700_000_000_000, serverSeq: 7 });
		server.error = { message: 'No hay conexión' };

		await expect(downloadOnce()).rejects.toThrow('No hay conexión');
		expect(await downloadedThrough()).toBe(0);

		server.error = null;
		const result = await downloadOnce();
		expect(result.applied).toBe(1);
		expect(await downloadedThrough()).toBe(7);
	});

	it('applying the same batch twice writes the same thing, not two things', async () => {
		await publish(note({ title: 'una sola vez' }), {
			changeSeq: 1_700_000_000_000,
			serverSeq: 1
		});

		await downloadOnce();
		// Rewind as if the mark had never been saved.
		await db.table('settings').put({ key: 'syncDownloadedThrough', value: 0 });
		await downloadOnce();

		expect(await db.table('notes').count()).toBe(1);
		expect(await listPendingUploads()).toEqual([]);
	});
});
