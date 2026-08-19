import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	appendActivity,
	listActivityByBlock,
	listActivityByNote,
	listRecentActivity
} from './activity';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('activity repository', () => {
	it('appends an entry with actor, action, at and defaults', async () => {
		const row = await appendActivity({
			blockId: 'b1',
			noteId: 'n1',
			actor: 'agent',
			action: 'done'
		});
		expect(row.blockId).toBe('b1');
		expect(row.actor).toBe('agent');
		expect(row.action).toBe('done');
		expect(row.text).toBe('');
		expect(typeof row.at).toBe('string');
		expect(row.deletedAt).toBe(null);
	});

	// Spec 038: `seq` salía de UN contador monótono, así que no podía empatar. Dos
	// cuentas son dos contadores leyendo el mismo reloj, y ahí sí.
	//
	// Se prueba contra `listRecentActivity` y no contra las dos ascendentes A
	// PROPÓSITO: IndexedDB ya devuelve las filas por clave primaria, así que un
	// orden ascendente con empate sale bien de casualidad y la prueba pasaría sin
	// el desempate. Al invertir el comparador esa casualidad se acaba, y ahí lo
	// único que puede sostener el orden es el desempate explícito.
	it('dos líneas con el mismo seq no se dan vuelta entre listas', async () => {
		const base = {
			noteId: 'n1',
			blockId: 'b1',
			actor: 'user',
			action: 'note',
			seq: 7,
			at: '2026-08-17T10:00:00.000Z',
			deletedAt: null
		};
		await db.table('activity').bulkAdd([
			{ ...base, id: 'zzz', text: 'segunda' },
			{ ...base, id: 'aaa', text: 'primera' }
		]);

		expect((await listActivityByBlock('b1')).map((r) => r.text)).toEqual(['primera', 'segunda']);
		// La misma lista al revés tiene que ser exactamente la inversa.
		expect((await listRecentActivity()).map((r) => r.text)).toEqual(['segunda', 'primera']);
	});

	it('lists a block entries ascending by at', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'user', action: 'created', text: 'c' });

		const rows = await listActivityByBlock('b1');
		expect(rows.map((r) => r.text)).toEqual(['a', 'b']);
	});

	it('lists a note entries and recent activity newest first', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });

		expect((await listActivityByNote('n1')).length).toBe(2);
		const recent = await listRecentActivity(10);
		expect(recent[0].text).toBe('b');
	});

	it('orders by a monotonic seq, independent of the wall clock', async () => {
		// Same wall-clock ms for all three; order must still be insertion order.
		const rows = [];
		for (const text of ['a', 'b', 'c']) {
			rows.push(await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'note', text }));
		}
		expect(rows.map((r) => r.seq)).toEqual([...rows.map((r) => r.seq)].sort((x, y) => x - y));
		expect((await listActivityByBlock('b1')).map((r) => r.text)).toEqual(['a', 'b', 'c']);
	});
});
