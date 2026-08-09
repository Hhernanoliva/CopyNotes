// El viaje de la llave entre dos aparatos, contra un servidor de mentira. Lo que
// se prueba acá no es Supabase: es el orden —pisar el código viejo antes de
// dejar el nuevo—, que lo usado se borre, y que cada final feo tenga su frase.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createVault, getVaultKey, hasVault } from './vault';
import { encryptRecord, decryptRecord } from './records';
import { grantUploadConsent } from './pending';

// Lo que el servidor tiene guardado, y todo lo que se le pidió.
const server = vi.hoisted(() => ({ row: null, calls: [] }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		// La llave de paso entra por una función del servidor, que pisa la anterior
		// aunque esté vencida — desde afuera no se puede (supabase/schema.sql).
		rpc: async (name, args) => {
			server.calls.push([name, 'pairings']);
			server.row = {
				salt: args.p_salt,
				iv: args.p_iv,
				wrapped: args.p_wrapped,
				expires_at: args.p_expires_at
			};
			return { error: null };
		},
		from: (table) => ({
			insert: async (row) => {
				server.calls.push(['insert', table]);
				server.row = row;
				return { error: null };
			},
			delete: () => ({
				eq: async () => {
					server.calls.push(['delete', table]);
					server.row = null;
					return { error: null };
				}
			}),
			select: () => ({
				maybeSingle: async () => {
					server.calls.push(['select', table]);
					return { data: server.row, error: null };
				}
			})
		})
	})
}));

import { joinWithPairingCode, startPairing } from './pairing';

beforeEach(async () => {
	server.row = null;
	server.calls.length = 0;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
});

describe('mostrar el código en el aparato que ya tiene la llave', () => {
	it('deja la llave envuelta arriba y devuelve el código para la pantalla', async () => {
		await createVault();

		const { code, expiresAt } = await startPairing();

		expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
		expect(server.row.wrapped).toEqual(expect.any(String));
		// El código de la pantalla NO viaja: lo que sube es la llave cerrada con él.
		expect(JSON.stringify(server.row)).not.toContain(code.replace('-', ''));
	});

	it('pide el código por la puerta del servidor, que pisa el anterior', async () => {
		// Y no con un borrar + insertar desde acá: si el código anterior venció, la
		// política de lectura lo esconde y Postgres no puede borrar lo que no puede
		// leer. Pedir un código y no usarlo dejaba trabado el pedido siguiente para
		// siempre; lo encontró `pnpm rls:check` contra el servidor de verdad.
		await createVault();

		await startPairing();
		server.calls.length = 0;
		await startPairing();

		expect(server.calls).toEqual([['start_pairing', 'pairings']]);
	});
});

describe('sumar el aparato nuevo', () => {
	it('baja la llave, la abre y borra lo que usó', async () => {
		await createVault();
		const original = await getVaultKey();
		const payload = await encryptRecord(original, 'notes', {
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		const { code } = await startPairing();
		// El aparato nuevo: la misma cuenta, ninguna llave.
		await db.table('vault').clear();
		server.calls.length = 0;

		const recibida = await joinWithPairingCode(code);

		expect(await decryptRecord(recibida, payload)).toEqual({
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		// Usada una vez y borrada: la ventana en la que la llave existe fuera de un
		// aparato dura lo que dura el viaje, no los diez minutos completos.
		expect(server.calls).toContainEqual(['delete', 'pairings']);
		expect(server.row).toBe(null);
	});

	it('cuando no hay nada arriba dice que venció, no que el código está mal', async () => {
		// El servidor esconde la fila vencida, así que "no hay fila" es exactamente
		// lo que ve un aparato que tardó. Decirle "código equivocado" lo mandaría a
		// mirarse los dedos en vez de a pedir otro código.
		await createVault();
		await db.table('vault').clear();

		await expect(joinWithPairingCode('ABCD-EFGH')).rejects.toThrow(/venció/i);
		expect(await hasVault()).toBe(false);
	});

	it('con un código equivocado no guarda nada y lo dice en criollo', async () => {
		await createVault();
		await startPairing();
		await db.table('vault').clear();

		await expect(joinWithPairingCode('ZZZZ-ZZZZ')).rejects.toThrow(/no es el que muestra/i);
		expect(await hasVault()).toBe(false);
		// Y la llave sigue arriba: un dedo equivocado no puede dejar a la persona
		// sin poder reintentar.
		expect(server.row).not.toBe(null);
	});

	it('un código con formato imposible se rechaza antes de tocar el servidor', async () => {
		await createVault();
		await startPairing();
		server.calls.length = 0;

		await expect(joinWithPairingCode('ABC')).rejects.toThrow(/formato/i);
		expect(server.calls).toEqual([]);
	});
});
