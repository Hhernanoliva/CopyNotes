import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, markSentToCloud } from '../storage/db';
import { createNote, softDeleteNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { appendActivity } from '../storage/activity';
import { setShareRole, getShareRole, getShareCursor } from '../storage/shares';
import { getShareName, rememberShareName } from '../storage/share-names';
import { syncStatus } from './status.svelte';
import {
	listSharedPending,
	countSharedPending,
	pullSharedNote,
	pushSharedNote,
	reconcileShares,
	syncShared
} from './shared';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

// Desde spec 038 §6 `reconcileShares` consulta además la tabla `share_members`
// para guardar los nombres de los invitados. Los clientes falsos que ya estaban
// sólo tenían `rpc`; este trozo les completa la otra mitad, y con la lista
// vacía ninguno cambia de comportamiento.
const conMiembros = (filas = []) => ({
	from: () => ({ select: () => ({ in: async () => ({ data: filas, error: null }) }) })
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

	// Encontrado en el gate manual (2026-08-17): el invitado borra la nota de su
	// aparato, el dueño se la vuelve a compartir, y no vuelve a aparecer nunca.
	// Su lápida local es más nueva que todo lo que baja, y el que la comparte no
	// tiene forma de enterarse.
	it('una nota que el invitado borró vuelve cuando se la comparten de nuevo', async () => {
		const note = await createNote({ title: 'la que borré' });
		const block = await createBlock({ noteId: note.id, content: 'un renglón' });
		await setShareRole(note.id, 'member');
		await softDeleteNote(note.id);

		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						table_name: 'notes',
						id: note.id,
						change_seq: 1,
						deleted: false,
						payload: { id: note.id, title: 'la que borré', deletedAt: null },
						author_id: 'u1',
						server_seq: 40
					},
					{
						table_name: 'blocks',
						id: block.id,
						change_seq: 1,
						deleted: false,
						payload: {
							id: block.id,
							noteId: note.id,
							content: 'un renglón',
							type: 'text',
							deletedAt: null
						},
						author_id: 'u1',
						server_seq: 41
					}
				],
				error: null
			})
		};

		await pullSharedNote(client, note.id);

		expect((await db.table('notes').get(note.id)).deletedAt).toBe(null);
		expect((await db.table('blocks').get(block.id)).deletedAt).toBe(null);
	});
});

describe('el tilde se deduce al final de la tanda', () => {
	// Arma una nota compartida con UNA tarea sin tildar y devuelve los dos ids.
	async function tareaCompartida({ checked = false } = {}) {
		const note = await createNote({ title: 'ticket' });
		await setShareRole(note.id, 'owner');
		const block = await createBlock({
			noteId: note.id,
			type: 'todo',
			content: 'llamar',
			order: 0
		});
		await db.table('blocks').update(block.id, { checked, fromCloud: true });
		// Sembradas como YA SUBIDAS. Sin esto quedan pendientes desde que se crean y
		// la prueba de "la deducción no encola nada" no puede distinguir su propia
		// siembra de lo que quiere medir.
		const stored = await db.table('blocks').get(block.id);
		await markSentToCloud('blocks', block.id, stored.changeSeq);
		await markSentToCloud('notes', note.id, (await db.table('notes').get(note.id)).changeSeq);
		return { noteId: note.id, blockId: block.id };
	}

	const lineaDelInvitado = (noteId, blockId, { id = 'a1', action = 'done', serverSeq = 100 } = {}) => ({
		table_name: 'activity',
		id,
		change_seq: 500,
		deleted: false,
		author_id: 'u2',
		server_seq: serverSeq,
		payload: {
			id,
			noteId,
			blockId,
			actor: 'member:u2',
			action,
			text: '',
			seq: 5,
			at: '2026-08-17T10:00:00.000Z',
			deletedAt: null
		}
	});

	const rpcCon = (filas) => ({ rpc: vi.fn().mockResolvedValue({ data: filas, error: null }) });

	it('la línea del invitado tilda la tarea de este lado', async () => {
		const { noteId, blockId } = await tareaCompartida();

		await pullSharedNote(rpcCon([lineaDelInvitado(noteId, blockId)]), noteId);

		expect((await db.table('blocks').get(blockId)).checked).toBe(true);
	});

	// La misma bajada trae la línea del invitado Y el renglón del dueño con su
	// `checked` viejo. Aplicándolas de a una, la respuesta depende del orden
	// dentro del paquete: acá el renglón viene DESPUÉS y pisaría el tilde.
	it('el renglón del dueño con su checked viejo no gana', async () => {
		const { noteId, blockId } = await tareaCompartida();

		await pullSharedNote(
			rpcCon([
				lineaDelInvitado(noteId, blockId),
				{
					table_name: 'blocks',
					id: blockId,
					change_seq: 600,
					deleted: false,
					author_id: 'u1',
					server_seq: 101,
					payload: {
						id: blockId,
						noteId,
						type: 'todo',
						content: 'llamar al contador',
						checked: false,
						order: 0,
						deletedAt: null
					}
				}
			]),
			noteId
		);

		const stored = await db.table('blocks').get(blockId);
		expect(stored.checked).toBe(true);
		expect(stored.content).toBe('llamar al contador');
	});

	it('la escritura deducida no queda pendiente de subida', async () => {
		const { noteId, blockId } = await tareaCompartida();

		await pullSharedNote(rpcCon([lineaDelInvitado(noteId, blockId)]), noteId);

		const stored = await db.table('blocks').get(blockId);
		expect(stored.cloudSeq).toBe(stored.changeSeq);
		expect(await countSharedPending()).toBe(0);
	});

	// Sin este freno, una tarea tildada por un camino que no deja línea —un
	// respaldo restaurado, un "[x]" pegado— se destildaría sola en la primera
	// pasada que trajera cualquier otra cosa de esa nota.
	it('una tarea sin líneas de tilde no se destilda sola', async () => {
		const { noteId, blockId } = await tareaCompartida({ checked: true });

		await pullSharedNote(
			rpcCon([lineaDelInvitado(noteId, blockId, { action: 'note' })]),
			noteId
		);

		expect((await db.table('blocks').get(blockId)).checked).toBe(true);
	});

	// El eco de la ventana de relectura: la misma línea vuelve en cada pasada y
	// ya no cambia nada. Sin esto la nota abierta se refrescaría cada 30 segundos.
	it('una segunda pasada con lo mismo no despierta a nadie', async () => {
		const { noteId, blockId } = await tareaCompartida();
		const filas = [lineaDelInvitado(noteId, blockId)];

		await pullSharedNote(rpcCon(filas), noteId);

		expect(await pullSharedNote(rpcCon(filas), noteId)).toBe(0);
	});
});

describe('en qué estoy', () => {
	it('el servidor manda: pone la marca que falta y saca la que sobra', async () => {
		const cerrada = await createNote({ title: 'ya no se comparte' });
		const nueva = await createNote({ title: 'me la compartieron' });
		await setShareRole(cerrada.id, 'owner');
		const client = {
			...conMiembros(),
			rpc: vi.fn().mockResolvedValue({ data: [{ note_id: nueva.id, role: 'member' }], error: null })
		};

		await reconcileShares(client);

		expect(await getShareRole(cerrada.id)).toBe(null);
		expect(await getShareRole(nueva.id)).toBe('member');
	});

	it('cuenta las marcas que cambiaron, y no las que ya estaban', async () => {
		const nueva = await createNote({ title: 'me la compartieron' });
		const vieja = await createNote({ title: 'ya la tenía marcada' });
		await setShareRole(vieja.id, 'owner');
		const client = {
			...conMiembros(),
			rpc: vi.fn().mockResolvedValue({
				data: [
					{ note_id: nueva.id, role: 'member' },
					{ note_id: vieja.id, role: 'owner' }
				],
				error: null
			})
		};

		expect((await reconcileShares(client)).changed).toBe(1);
	});

	// La tercera columna de `list_shares` (parte B1). El invitado no tiene ninguna
	// otra forma de saber cómo se llama el dueño, así que este viaje es el único
	// que lo trae y hay que guardarlo al pasar.
	it('guarda el nombre del dueño que viene con la lista', async () => {
		const nota = await createNote({ title: 'me la compartieron' });
		const client = {
			...conMiembros(),
			rpc: vi.fn().mockResolvedValue({
				data: [{ note_id: nota.id, role: 'member', counterpart_label: 'Hernán' }],
				error: null
			})
		};

		await reconcileShares(client);

		expect(await getShareName(`owner:${nota.id}`)).toBe('Hernán');
	});

	// Y una compartición abierta por la parte A no tiene nombre. Que no reviente es
	// la mitad; la otra es que no escriba un vacío encima de uno bueno, y esa es la
	// que se rompe sola si alguien "simplifica" la guardia.
	it('no pisa un nombre bueno con el nulo de una compartición vieja', async () => {
		const nota = await createNote({ title: 'me la compartieron' });
		await setShareRole(nota.id, 'member');
		await rememberShareName(`owner:${nota.id}`, 'Hernán');
		const client = {
			...conMiembros(),
			rpc: vi.fn().mockResolvedValue({
				data: [{ note_id: nota.id, role: 'member', counterpart_label: null }],
				error: null
			})
		};

		await reconcileShares(client);

		expect(await getShareName(`owner:${nota.id}`)).toBe('Hernán');
	});

	// Los nombres de los INVITADOS los leía sólo `ShareDialog`, así que un dueño
	// que mira la bitácora sin abrir ese panel no tenía ningún nombre que mostrar
	// y veía `member:8f3a…` crudo.
	it('guarda los nombres de los miembros en cada pasada, sin abrir el panel', async () => {
		const nota = await createNote({ title: 'compartida' });
		const client = {
			...conMiembros([{ member_id: 'u-2', display_name: 'Juan' }]),
			rpc: vi.fn().mockResolvedValue({ data: [{ note_id: nota.id, role: 'owner' }], error: null })
		};

		await reconcileShares(client);

		expect(await getShareName('u-2')).toBe('Juan');
	});

	// Mismo motivo que el del dueño, un renglón más abajo.
	it('un nombre vacío no pisa el que ya había', async () => {
		const nota = await createNote({ title: 'compartida' });
		await rememberShareName('u-2', 'Juan');
		const client = {
			...conMiembros([{ member_id: 'u-2', display_name: null }]),
			rpc: vi.fn().mockResolvedValue({ data: [{ note_id: nota.id, role: 'owner' }], error: null })
		};

		await reconcileShares(client);

		expect(await getShareName('u-2')).toBe('Juan');
	});
});

// Encontrado en el gate manual del 2026-08-14: al compartir una nota en el otro
// aparato, acá la marca entraba a la base y la lista no la mostraba hasta
// recargar. Es la misma familia que el bug de la bajada, un nivel más arriba: la
// marca la pone `reconcileShares`, y su cambio no llegaba a `appliedVersion`.
describe('el lazo entero', () => {
	const clientWith = (shares) => ({
		...conMiembros(),
		rpc: vi.fn(async (name) =>
			name === 'list_shares' ? { data: shares, error: null } : { data: [], error: null }
		)
	});

	it('una marca nueva despierta a la pantalla aunque no cambie ninguna fila', async () => {
		const nota = await createNote({ title: 'me la compartieron' });

		expect(await syncShared(clientWith([{ note_id: nota.id, role: 'member' }]))).toBe(1);
	});

	it('una pasada sin novedades no despierta a nadie', async () => {
		const nota = await createNote({ title: 'ya compartida' });
		await setShareRole(nota.id, 'member');

		expect(await syncShared(clientWith([{ note_id: nota.id, role: 'member' }]))).toBe(0);
	});

	// Encontrado en el gate manual (2026-08-17): aceptar una invitación traía la
	// nota a la base y la lista no la mostraba hasta recargar. La campanita la
	// tocaba `syncNow`, y `InviteAccept` llama a `syncShared` por su cuenta —
	// devolver el número y confiar en que el llamador lo use ya falló una vez,
	// así que la campanita vive ACÁ y no hay nada que un llamador nuevo pueda
	// olvidarse.
	it('la campanita la toca el lazo, no quien lo llama', async () => {
		const nota = await createNote({ title: 'me la compartieron' });
		const antes = syncStatus.appliedVersion;

		await syncShared(clientWith([{ note_id: nota.id, role: 'member' }]));

		expect(syncStatus.appliedVersion).toBe(antes + 1);
	});

	// Una fila que no puede salir frenaba TODA la pasada, no esa nota.
	//
	// `pushSharedNote` tira, y ese tiro salía del lazo, de `syncShared` y le caía
	// a `syncNow` — que llama al caño compartido ANTES de `ready()`,
	// `uploadBatch` y `downloadAll`. O sea: una nota compartida con una captura
	// adentro (borrar la imagen, compartir, Ctrl+Z alcanza) dejaba sin
	// sincronizar las OTRAS notas compartidas y el caño cifrado entero, cada 30
	// segundos, para siempre.
	it('una nota que no puede sincronizar no se lleva puestas a las demás', async () => {
		const rota = await createNote({ title: 'con una captura adentro' });
		await createBlock({ noteId: rota.id, type: 'image', imageId: 'a'.repeat(64) });
		await setShareRole(rota.id, 'owner');
		const sana = await createNote({ title: 'la de al lado' });
		await createBlock({ noteId: sana.id, content: 'texto' });
		await setShareRole(sana.id, 'owner');
		const empujadas = [];
		const client = {
			...conMiembros(),
			rpc: vi.fn(async (name, args) => {
				if (name === 'push_shared_rows') empujadas.push(args.p_note_id);
				return name === 'list_shares'
					? {
							data: [
								{ note_id: rota.id, role: 'owner' },
								{ note_id: sana.id, role: 'owner' }
							],
							error: null
						}
					: { data: [], error: null };
			})
		};

		// Sin el try/catch por nota, ESTA línea tira y la prueba se pone roja.
		await syncShared(client);

		expect(empujadas).toContain(sana.id);
		expect(empujadas).not.toContain(rota.id);
	});

	it('y la falla se cuenta, no se traga en silencio', async () => {
		const rota = await createNote({ title: 'con una captura adentro' });
		await createBlock({ noteId: rota.id, type: 'image', imageId: 'a'.repeat(64) });
		await setShareRole(rota.id, 'owner');
		syncStatus.error = null;

		await syncShared(clientWith([{ note_id: rota.id, role: 'owner' }]));

		// Sin el `reportSyncFailure(error)` del catch, ESTA línea recibe null.
		expect(syncStatus.error).toBe(
			'No se pudo sincronizar. Lo tuyo está guardado en este dispositivo.'
		);
	});

	// El cierre automático (decidido al cerrar el gate de B1, 2026-08-17). El
	// servidor sólo MARCA que la compartición se quedó sin nadie; cerrarla de
	// verdad —resellar las filas para el caño cifrado y recién ahí borrarla— es
	// trabajo del aparato del dueño, y por eso pasa acá.
	it('una compartición que se quedó sin nadie se cierra sola', async () => {
		const nota = await createNote({ title: 'sin nadie del otro lado' });
		await setShareRole(nota.id, 'owner');
		const llamadas = [];
		const client = {
			...conMiembros(),
			rpc: vi.fn(async (name) => {
				llamadas.push(name);
				return name === 'list_shares'
					? { data: [{ note_id: nota.id, role: 'owner', emptied: true }], error: null }
					: { data: [], error: null };
			})
		};

		await syncShared(client);

		expect(await getShareRole(nota.id)).toBe(null);
		expect(llamadas).toContain('close_share');
	});

	// Y no se cierra por tener cero invitados: recién compartida, antes de generar
	// el link, tampoco hay nadie. Sin este control el arreglo rompería compartir.
	it('una recién compartida, sin la marca, NO se cierra', async () => {
		const nota = await createNote({ title: 'recién compartida' });
		await setShareRole(nota.id, 'owner');
		const llamadas = [];
		const client = {
			...conMiembros(),
			rpc: vi.fn(async (name) => {
				llamadas.push(name);
				return name === 'list_shares'
					? { data: [{ note_id: nota.id, role: 'owner', emptied: false }], error: null }
					: { data: [], error: null };
			})
		};

		await syncShared(client);

		expect(await getShareRole(nota.id)).toBe('owner');
		expect(llamadas).not.toContain('close_share');
	});

	it('y una pasada sin novedades no la toca', async () => {
		const nota = await createNote({ title: 'ya compartida' });
		await setShareRole(nota.id, 'member');
		const antes = syncStatus.appliedVersion;

		await syncShared(clientWith([{ note_id: nota.id, role: 'member' }]));

		expect(syncStatus.appliedVersion).toBe(antes);
	});

	// El candado del rol, visto desde el lazo entero y no desde `listSharedPending`.
	//
	// Existe porque el rol viaja desde `list_shares` hasta `listSharedPending`
	// cruzando un `Map`, y cualquier cambio en la FORMA de ese Map —como el que
	// trajo el nombre del dueño— puede dejar el rol convertido en otra cosa sin
	// que nada falle a la vista: `role === 'member'` deja de ser cierto, y el caño
	// pasa a ofrecer las tres tablas de una nota ajena. Comprobado en rojo
	// desarmando mal el Map.
	it('de una nota ajena sube SÓLO bitácora, aunque el renglón esté sin subir', async () => {
		const nota = await createNote({ title: 'ajena' });
		await createBlock({ noteId: nota.id, content: 'un renglón que no me toca' });
		await setShareRole(nota.id, 'member');
		await appendActivity({
			blockId: 'b1',
			noteId: nota.id,
			actor: 'user',
			action: 'done',
			text: ''
		});
		const subidas = [];
		const client = {
			...conMiembros(),
			rpc: vi.fn(async (name, args) => {
				if (name === 'list_shares') {
					return { data: [{ note_id: nota.id, role: 'member', counterpart_label: 'X' }], error: null };
				}
				if (name === 'push_shared_rows') subidas.push(...args.payload);
				return { data: [], error: null };
			})
		};

		await syncShared(client);

		expect(subidas.length).toBeGreaterThan(0);
		expect(subidas.every((fila) => fila.table_name === 'activity')).toBe(true);
	});
});
