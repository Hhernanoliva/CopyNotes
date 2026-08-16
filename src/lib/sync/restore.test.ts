// Restaurar un respaldo con la nube encendida (spec 039). Este archivo es la
// medición que abrió la spec, dada vuelta: con el código de antes, restaurar 25
// filas dejaba 25 conflictos y 0 subidas, y el respaldo quedaba inerte.
//
// El servidor de mentira de `upload.test.ts` no sirve acá: no guarda nada, y lo
// que hay que reproducir es justamente la regla de rechazo contra una fila que YA
// EXISTE. Éste guarda filas y reparte `server_seq` que nunca retrocede.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote, softDeleteNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { dumpAllTables, replaceAllTables } from '../storage/backup';
import { grantUploadConsent } from './pending';
import { createVault } from './vault';

const server = vi.hoisted(() => ({ rows: new Map(), seq: 0, resets: 0, calls: [] }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		rpc: async (name, args) => {
			server.calls.push(name);
			if (name === 'reset_records') {
				server.rows.clear();
				server.resets++;
				return { data: null, error: null };
			}
			if (name === 'push_records') {
				const rejected = [];
				for (const row of args.payload) {
					const key = `${row.table_name}:${row.id}`;
					const held = server.rows.get(key);
					// La regla de verdad: base nula contra una fila que existe es un
					// rechazo, y una base que no coincide también.
					if (held && (row.base_seq === null || held.change_seq !== row.base_seq)) {
						rejected.push({ rejected_table: row.table_name, rejected_id: row.id });
						continue;
					}
					server.rows.set(key, { ...row, server_seq: ++server.seq });
				}
				return { data: rejected, error: null };
			}
			return { data: [], error: null };
		},
		from: () => ({
			insert: async () => ({ error: null }),
			select: () => ({
				maybeSingle: async () => ({ data: null, error: null }),
				gt: (_column, value) => ({
					order: () => ({
						limit: async () => ({
							data: [...server.rows.values()]
								.filter((row) => row.server_seq > Number(value))
								.sort((a, b) => a.server_seq - b.server_seq),
							error: null
						})
					})
				})
			})
		})
	})
}));

async function loadSync() {
	vi.resetModules();
	const [upload, restore] = await Promise.all([import('./upload'), import('./restore')]);
	return { syncNow: upload.syncNow, claimAccountAfterRestore: restore.claimAccountAfterRestore };
}

async function seedFiveNotes() {
	for (let n = 0; n < 5; n++) {
		const note = await createNote({ title: `nota ${n}` });
		for (let b = 0; b < 4; b++) await createBlock({ noteId: note.id, content: `renglón ${n}.${b}` });
	}
}

beforeEach(async () => {
	server.rows.clear();
	server.resets = 0;
	server.calls.length = 0;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
	await createVault();
});

describe('restaurar un respaldo con la nube encendida', () => {
	it('no deja ningún conflicto, y el servidor termina con el archivo', async () => {
		const { syncNow, claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		await syncNow();
		const backup = await dumpAllTables();
		expect(server.rows.size).toBe(25);

		// Lo que hizo Hernán: borrar, y después restaurar el respaldo. Un borrado es
		// una marca, no una destrucción, y viaja como lápida: el servidor termina la
		// pasada con las 25 filas puestas como borradas.
		for (const note of await db.table('notes').toArray()) await softDeleteNote(note.id);
		await syncNow();
		await replaceAllTables(backup);
		await claimAccountAfterRestore();
		// Cinco pasadas: un conflicto que aparece tarde también cuenta.
		for (let pass = 0; pass < 5; pass++) await syncNow();

		expect(await db.table('conflicts').count()).toBe(0);
		const vivas = [...server.rows.values()].filter((row) => !row.deleted);
		expect(vivas.length).toBe(25);
	});

	it('vacía el servidor ANTES de subir, no después', async () => {
		const { syncNow, claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		await syncNow();
		const backup = await dumpAllTables();
		server.calls.length = 0;

		await replaceAllTables(backup);
		await claimAccountAfterRestore();

		// Al revés (subir y después vaciar) el servidor queda vacío y el aparato
		// creyendo que subió todo: la cuenta pierde las notas en silencio.
		expect(server.calls.indexOf('reset_records')).toBeLessThan(
			server.calls.indexOf('push_records')
		);
	});

	it('sin nube no toca la red y lo dice', async () => {
		await db.table('vault').clear();
		const { claimAccountAfterRestore } = await loadSync();
		server.calls.length = 0;

		expect(await claimAccountAfterRestore()).toBe(false);
		expect(server.calls).toEqual([]);
	});

	it('la bóveda y el permiso de subir sobreviven a un restore', async () => {
		const { claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		const backup = await dumpAllTables();

		await replaceAllTables(backup);
		await claimAccountAfterRestore();

		expect(await db.table('vault').count()).toBe(1);
		expect(server.resets).toBe(1);
	});
});
