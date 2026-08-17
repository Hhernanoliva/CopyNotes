import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { getShareRole, setShareRole } from '../storage/shares';
import { getShareName } from '../storage/share-names';
import {
	acceptInvite,
	createInvite,
	inviteLink,
	leaveShare,
	listMembers,
	removeMember
} from './invites';

// El servidor de mentira ramifica por nombre de `rpc`. NO tratarlo como una sola
// función: en la parte A, un doble que contestaba lo mismo a cualquier `rpc`
// puso rojas diez pruebas de golpe apenas `syncNow` empezó a llamar a otra.
function fakeClient(handlers = {}) {
	const llamadas = [];
	return {
		llamadas,
		rpc: async (name, args) => {
			llamadas.push({ name, args });
			return handlers[name]?.(args) ?? { data: null, error: null };
		},
		// `listMembers` encadena `.select(...).eq(...)`, así que el doble tiene que
		// tener las dos.
		from: (table) => ({
			select: () => ({
				eq: async (columna, valor) => {
					llamadas.push({ name: `from:${table}`, args: { [columna]: valor } });
					return handlers[`from:${table}`]?.() ?? { data: [], error: null };
				}
			})
		})
	};
}

describe('las invitaciones', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
	});

	it('pide el token con los dos nombres', async () => {
		const client = fakeClient({
			create_share_invite: () => ({ data: 'tok123', error: null })
		});
		expect(await createInvite(client, 'note_1', 'Juan', 'Hernán')).toBe('tok123');
		expect(client.llamadas[0]).toEqual({
			name: 'create_share_invite',
			args: { p_note_id: 'note_1', p_member_label: 'Juan', p_owner_label: 'Hernán' }
		});
	});

	// El error del servidor llega adentro de `error`, no como excepción. Sin esta
	// rama la pantalla diría "listo" sobre una invitación que no se creó.
	it('convierte el error del servidor en una excepción', async () => {
		const client = fakeClient({
			create_share_invite: () => ({
				data: null,
				error: { message: 'sólo quien comparte la nota puede invitar' }
			})
		});
		await expect(createInvite(client, 'note_1', 'Juan', 'Hernán')).rejects.toThrow(
			'sólo quien comparte la nota puede invitar'
		);
	});

	// Visto en el gate manual (2026-08-17): aceptar una invitación con la red
	// caída mostró "No se pudo: TypeError: Failed to fetch". Los mensajes del
	// servidor ya vienen en castellano —los escribe cada `raise exception`— así
	// que el único que hay que traducir es el del navegador.
	it('la red caída se cuenta en castellano, no con el nombre de un tipo', async () => {
		for (const message of ['TypeError: Failed to fetch', 'NetworkError', 'Load failed']) {
			const client = fakeClient({
				accept_share_invite: () => ({ data: null, error: { message } })
			});
			await expect(acceptInvite(client, 'tok')).rejects.toThrow(/no se pudo conectar/i);
		}
	});

	// El link tiene que apuntar a la web SIEMPRE. Adentro de la app de escritorio
	// `window.location.origin` es un esquema interno de Tauri, y un link así no lo
	// puede abrir nadie más que la máquina que lo generó.
	it('arma el link contra la web aunque lo genere la app de escritorio', () => {
		expect(inviteLink('tok123', 'https://copynotes-beta.vercel.app')).toBe(
			'https://copynotes-beta.vercel.app/?invitacion=tok123'
		);
		expect(inviteLink('tok123', 'tauri://localhost')).toBe(
			'https://copynotes-beta.vercel.app/?invitacion=tok123'
		);
	});

	// Y en desarrollo o en una preview, el origen de verdad sirve tal cual: si no,
	// probar una invitación obligaría a tocar el código.
	it('respeta un origen http de verdad', () => {
		expect(inviteLink('tok123', 'http://localhost:5173')).toBe(
			'http://localhost:5173/?invitacion=tok123'
		);
	});

	it('canjea el token y devuelve qué nota esperar', async () => {
		const client = fakeClient({ accept_share_invite: () => ({ data: 'note_1', error: null }) });
		expect(await acceptInvite(client, 'tok123')).toBe('note_1');
	});

	// La lista sale de la tabla, que su RLS ya le deja leer al dueño. Y de paso se
	// guardan los nombres, porque este es el único viaje que los trae.
	it('lista los miembros y de paso guarda sus nombres', async () => {
		const client = fakeClient({
			'from:share_members': () => ({
				data: [{ member_id: 'uuid-de-juan', display_name: 'Juan' }],
				error: null
			})
		});
		expect(await listMembers(client, 'note_1')).toEqual([{ id: 'uuid-de-juan', name: 'Juan' }]);
		expect(await getShareName('uuid-de-juan')).toBe('Juan');
	});

	// Pide los miembros DE ESA NOTA. Sin el filtro, la pantalla del dueño mezcla
	// los invitados de todas sus notas compartidas en una sola lista.
	it('pide los miembros de esa nota y no de todas', async () => {
		const client = fakeClient({ 'from:share_members': () => ({ data: [], error: null }) });
		await listMembers(client, 'note_1');
		expect(client.llamadas[0]).toEqual({ name: 'from:share_members', args: { note_id: 'note_1' } });
	});

	it('quita a un miembro por su uuid', async () => {
		const client = fakeClient();
		await removeMember(client, 'note_1', 'uuid-de-juan');
		expect(client.llamadas[0]).toEqual({
			name: 'remove_member',
			args: { p_note_id: 'note_1', p_member_id: 'uuid-de-juan' }
		});
	});

	// El invitado se va solo, y su puerta no toma a quién: un parámetro que sólo
	// puede valer la propia cuenta es un agujero esperando a que alguien lo llame
	// con otra cosa.
	it('el invitado se va sin decir quién es', async () => {
		const client = fakeClient();
		await leaveShare(client, 'note_1');
		expect(client.llamadas[0]).toEqual({
			name: 'leave_share',
			args: { p_note_id: 'note_1' }
		});
	});

	// Encontrado en el paso 9 del gate manual (2026-08-17): al salirse, la
	// pantalla seguía ofreciendo "Salirme de esta nota" y se podía apretar una y
	// otra vez, porque el panel se dibuja leyendo la marca LOCAL y esa la limpiaba
	// recién `reconcileShares`, hasta 30 segundos después.
	it('salirse borra la marca acá, sin esperar la pasada siguiente', async () => {
		const nota = await createNote({ title: 'ajena' });
		await setShareRole(nota.id, 'member');

		await leaveShare(fakeClient(), nota.id);

		expect(await getShareRole(nota.id)).toBe(null);
	});

	// Y si el servidor dice que no, la marca NO se toca: seguís adentro de la
	// nota, y una pantalla que diga lo contrario es peor que el error.
	it('un servidor que rechaza deja la marca como estaba', async () => {
		const nota = await createNote({ title: 'ajena' });
		await setShareRole(nota.id, 'member');
		const client = fakeClient({
			leave_share: () => ({ data: null, error: { message: 'no sos parte de esta nota' } })
		});

		await expect(leaveShare(client, nota.id)).rejects.toThrow();

		expect(await getShareRole(nota.id)).toBe('member');
	});
});
