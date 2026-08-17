// Proves the lock: one account cannot read, write over, or plant rows in
// another account's data. This is the acceptance criterion spec 030 demands
// ("an account cannot read another account's rows, enforced server-side").
//
// Run it with:  pnpm rls:check
//
// It is a script and not part of `pnpm test` on purpose: it needs the real
// Supabase project and the service_role key, which only exists in a developer's
// local .env. Everything it creates (two throwaway accounts and their rows) is
// deleted before it exits, including when an assertion fails.
//
// Both accounts deliberately use the SAME record id, because isolation must come
// from the owner and not from ids happening to differ.

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert(
	url && anonKey && serviceKey,
	'Faltan PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en .env'
);

const SHARED_ID = 'rls-check-same-id';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, noSession);

function unwrap({ data, error }) {
	if (error) throw error;
	return data;
}

// A real signed-in client, the same way the app talks to Supabase. Password auth
// is used only here: the app itself logs in with a 6-digit email code, which a
// script cannot receive.
async function createAccount(label) {
	const email = `rls-check-${label}-${crypto.randomUUID()}@copynotes.test`;
	const password = crypto.randomUUID();
	const { user } = unwrap(
		await admin.auth.admin.createUser({ email, password, email_confirm: true })
	);
	const client = createClient(url, anonKey, noSession);
	unwrap(await client.auth.signInWithPassword({ email, password }));
	return { id: user.id, client };
}

function record(secret) {
	return {
		table_name: 'notes',
		id: SHARED_ID,
		change_seq: 1,
		// Not real ciphertext — this script tests the lock, not the crypto
		// (sync/records.test.ts owns that).
		iv: btoa('123456789012'),
		blob: btoa(secret)
	};
}

const a = await createAccount('a');
const b = await createAccount('b');

// La única puerta de escritura, y por eso también la de armado: `records` ya no
// acepta un `insert` directo de nadie (ver la política en supabase/schema.sql).
const push = async (client, payload) => unwrap(await client.rpc('push_records', { payload }));

try {
	await push(a.client, [{ ...record('secreto-de-A'), base_seq: null }]);
	await push(b.client, [{ ...record('secreto-de-B'), base_seq: null }]);
	console.log('✓ cada cuenta pudo guardar su propia fila (con el mismo id)');

	// 1. Reading gives you your own row and nothing else.
	const seenByA = unwrap(await a.client.from('records').select('blob, owner_id'));
	assert.equal(seenByA.length, 1, 'A tendría que ver exactamente una fila');
	assert.equal(atob(seenByA[0].blob), 'secreto-de-A', 'A vio la fila de otra cuenta');
	assert.equal(seenByA[0].owner_id, a.id);
	console.log('✓ A solo ve su propia fila, no la de B');

	// 2. Asking for the other account's row by owner is empty, not an error:
	//    invisible, not forbidden.
	const probe = unwrap(await a.client.from('records').select('id').eq('owner_id', b.id));
	assert.equal(probe.length, 0, 'A pudo leer filas de B');
	console.log('✓ A pide explícitamente las filas de B y recibe cero');

	// 3. Escribir directo ya no existe: ni a nombre de otro, ni a nombre propio.
	//    Antes esto se apoyaba en el filtro por dueño; ahora la razón es más
	//    fuerte, porque no hay ninguna política que permita insertar.
	const planted = await a.client.from('records').insert({ ...record('inyectado'), owner_id: b.id });
	assert(planted.error, 'A pudo insertar una fila a nombre de B');
	const bare = await a.client.from('records').insert(record('por-la-ventana'));
	assert(bare.error, 'A pudo insertar una fila saltándose push_records');
	console.log(`✓ nadie puede insertar en records fuera de push_records (${bare.error.code})`);

	// 4. Ni actualizar ni borrar directo, ni lo de otro ni lo propio. Un cliente
	//    viejo con un error, o una llamada a mano, ya no puede saltearse el
	//    control de versiones ni vaciar la copia de la nube: un borrado tiene que
	//    viajar como lápida, nunca como fila borrada.
	unwrap(
		await a.client.from('records').update({ blob: btoa('pisado') }).eq('table_name', 'notes')
	);
	unwrap(await a.client.from('records').delete().eq('table_name', 'notes'));
	const stillB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(stillB[0].blob), 'secreto-de-B', 'A pudo sobrescribir la fila de B');
	const stillA = unwrap(await a.client.from('records').select('blob'));
	assert.equal(stillA.length, 1, 'A pudo borrar su propia fila por fuera de push_records');
	assert.equal(atob(stillA[0].blob), 'secreto-de-A', 'A pudo pisar su propia fila directo');
	console.log('✓ actualizar y borrar directo no cambian nada, ni lo ajeno ni lo propio');

	// 5. La marca de la bóveda está cerrada igual — y además sólo se puede crear
	//    una vez. Sin eso, dos aparatos que crean su bóveda casi a la vez dejaban
	//    la cuenta con una llave que abre la mitad de los registros. Desde la spec
	//    035 lo que hay acá es la prueba (un texto conocido cifrado), no la llave.
	unwrap(await b.client.from('vaults').insert({ iv: 'i', check_blob: 'prueba-de-B' }));
	const vaults = unwrap(await a.client.from('vaults').select('owner_id'));
	assert.equal(vaults.length, 0, 'A pudo leer la marca de bóveda de B');
	console.log('✓ A no puede leer la bóveda de B');

	const secondVault = await b.client.from('vaults').insert({ iv: 'i2', check_blob: 'otra' });
	assert.equal(secondVault.error?.code, '23505', 'B pudo crear una segunda bóveda');
	unwrap(await b.client.from('vaults').update({ check_blob: 'pisada' }).eq('owner_id', b.id));
	const vaultB = unwrap(await b.client.from('vaults').select('check_blob'));
	assert.equal(vaultB[0].check_blob, 'prueba-de-B', 'la bóveda de B se pudo pisar');
	console.log('✓ la primera bóveda de la cuenta gana: no se puede duplicar ni pisar');

	// 6. The exact call `sync/upload.ts` makes. Records go up through
	//    `push_records`, never a bare upsert, because it is the only writer that
	//    can refuse one. Standing on the version the server holds overwrites;
	//    standing on a stale one is refused and changes nothing.
	const refusedNone = await push(a.client, [
		{ ...record('secreto-de-A-v2'), change_seq: 2, base_seq: 1 }
	]);
	assert.equal(refusedNone.length, 0, 'el servidor rechazó una escritura que sí venía al día');
	const afterResend = unwrap(await a.client.from('records').select('blob, change_seq'));
	assert.equal(afterResend.length, 1, 'el reenvío duplicó la fila en vez de sobrescribirla');
	assert.equal(atob(afterResend[0].blob), 'secreto-de-A-v2');

	const refusedStale = await push(a.client, [
		{ ...record('pisoteo'), change_seq: 3, base_seq: 1 }
	]);
	assert.deepEqual(
		refusedStale,
		[{ rejected_table: 'notes', rejected_id: SHARED_ID }],
		'el servidor aceptó una escritura parada sobre una versión que ya no tiene'
	);
	const afterStale = unwrap(await a.client.from('records').select('blob'));
	assert.equal(atob(afterStale[0].blob), 'secreto-de-A-v2', 'una escritura vieja pisó la nueva');
	console.log('✓ push_records acepta al que viene al día y rechaza al que no');

	// 7. And the guarded door is not a way around the lock: B's row has the same
	//    id, so if `push_records` wrote by id instead of by owner it would land on
	//    it. The insert stamps `owner_id` from the session, and the update filters
	//    by it, so A can only ever reach A's own row.
	await push(a.client, [{ ...record('inyectado-por-la-puerta'), change_seq: 9, base_seq: null }]);
	const stillBAfterPush = unwrap(await b.client.from('records').select('blob'));
	assert.equal(
		atob(stillBAfterPush[0].blob),
		'secreto-de-B',
		'A alcanzó la fila de B a través de push_records'
	);
	console.log('✓ A no puede tocar la fila de B a través de push_records');

	// 8. La llave de paso (spec 035) es la única ventana en la que la llave existe
	//    fuera de un aparato. Si esto se rompe, se rompe todo lo demás con ello.
	const enDiezMinutos = new Date(Date.now() + 600_000).toISOString();
	async function dejarLlaveDePaso(client, wrapped, expira) {
		return unwrap(
			await client.rpc('start_pairing', {
				p_salt: 's',
				p_iv: 'i',
				p_wrapped: wrapped,
				p_expires_at: expira
			})
		);
	}
	await dejarLlaveDePaso(a.client, 'llave-de-A', enDiezMinutos);
	// Y entrar por la ventana no se puede: la única puerta es esa función.
	const aMano = await a.client
		.from('pairings')
		.insert({ salt: 's', iv: 'i', wrapped: 'a-mano', expires_at: enDiezMinutos });
	assert(aMano.error, 'se pudo dejar una llave de paso sin pasar por start_pairing');
	const espiada = unwrap(await b.client.from('pairings').select('wrapped'));
	assert.deepEqual(espiada, [], 'B pudo ver la llave de paso de A');
	console.log('✓ B no puede ver la llave de paso de A');

	// 9. Y tampoco puede borrársela, que dejaría a A sin poder sumar el aparato
	//    justo mientras lo está sumando.
	await b.client.from('pairings').delete().eq('owner_id', a.id);
	const sigue = unwrap(await a.client.from('pairings').select('wrapped'));
	assert.equal(sigue.length, 1, 'B pudo borrar la llave de paso de A');
	console.log('✓ B no puede borrar la llave de paso de A');

	// 10. Una fila vencida no la ve ni su propio dueño: el vencimiento lo decide
	//     el servidor y no el reloj del aparato, que se puede atrasar a mano.
	await dejarLlaveDePaso(a.client, 'llave-vencida', new Date(Date.now() - 1000).toISOString());
	const vencida = unwrap(await a.client.from('pairings').select('wrapped'));
	assert.deepEqual(vencida, [], 'una llave de paso vencida se pudo leer');

	// 11. Y una vencida se tiene que poder REEMPLAZAR. Acá se cayó la primera
	//     versión: como la política de lectura esconde la vencida y Postgres
	//     necesita leer una fila para borrarla, el dueño no podía sacársela de
	//     encima, y la clave primaria le bloqueaba el pedido siguiente PARA
	//     SIEMPRE. O sea: pedir un código, no usarlo, y no poder pedir otro nunca
	//     más. Por eso entrar es una función del servidor y no un insert.
	await dejarLlaveDePaso(a.client, 'llave-nueva', enDiezMinutos);
	const reemplazada = unwrap(await a.client.from('pairings').select('wrapped'));
	assert.deepEqual(
		reemplazada,
		[{ wrapped: 'llave-nueva' }],
		'una llave de paso vencida dejó bloqueado el pedido siguiente'
	);
	console.log('✓ la llave de paso vencida no se lee, y se puede reemplazar');

	// 12. El segundo caño (spec 038). Una nota compartida viaja EN CLARO, así que
	//     el cifrado ya no defiende nada acá: el único candado que queda es quién
	//     puede leer esa nota y quién puede escribirla.
	const NOTA_DE_A = 'nota-compartida-de-A';
	const NOTA_DE_B = 'nota-compartida-de-B';
	const renglon = (noteId, id, texto) => ({
		table_name: 'blocks',
		id,
		change_seq: 1,
		base_seq: null,
		deleted: false,
		payload: { id, noteId, content: texto }
	});
	unwrap(await a.client.rpc('open_share', { p_note_id: NOTA_DE_A }));
	unwrap(await b.client.rpc('open_share', { p_note_id: NOTA_DE_B }));
	unwrap(
		await a.client.rpc('push_shared_rows', {
			p_note_id: NOTA_DE_A,
			payload: [renglon(NOTA_DE_A, 'b-de-A', 'renglón de la nota de A')]
		})
	);
	unwrap(
		await b.client.rpc('push_shared_rows', {
			p_note_id: NOTA_DE_B,
			payload: [renglon(NOTA_DE_B, 'b-de-B', 'renglón de la nota de B')]
		})
	);

	const bajadaAjena = await b.client.rpc('pull_shared_rows', { p_note_id: NOTA_DE_A, p_cursor: 0 });
	assert(bajadaAjena.error, 'B se bajó una nota compartida de la que no es parte');
	const espiadas = unwrap(await b.client.from('share_rows').select('id'));
	assert.deepEqual(
		espiadas.map((row) => row.id),
		['b-de-B'],
		'B leyó por la tabla las filas compartidas de A'
	);
	const subidaAjena = await b.client.rpc('push_shared_rows', {
		p_note_id: NOTA_DE_A,
		payload: [renglon(NOTA_DE_A, 'inyectado', 'no soy parte de esto')]
	});
	assert(subidaAjena.error, 'B escribió en una nota compartida de la que no es parte');
	console.log('✓ quien no es parte de una nota compartida no la lee ni la escribe');

	// 13. Ya invitado, el rol es la única defensa que queda. Un invitado agrega
	//     bitácora y nada más, y la firma NO se le cree: si se le creyera podría
	//     tildar en nombre del dueño, que es justo lo que la función existe para
	//     contar. La membresía se planta con la llave de servicio porque la
	//     invitación es de la parte B y todavía no existe.
	unwrap(await admin.from('share_members').insert({ note_id: NOTA_DE_A, member_id: b.id }));
	const rechazado = unwrap(
		await b.client.rpc('push_shared_rows', {
			p_note_id: NOTA_DE_A,
			payload: [renglon(NOTA_DE_A, 'b-del-invitado', 'un renglón que no le toca')]
		})
	);
	assert.deepEqual(
		rechazado,
		[{ rejected_table: 'blocks', rejected_id: 'b-del-invitado' }],
		'un invitado pudo escribir un renglón de la nota'
	);
	const aceptado = unwrap(
		await b.client.rpc('push_shared_rows', {
			p_note_id: NOTA_DE_A,
			payload: [
				{
					table_name: 'activity',
					id: 'linea-del-invitado',
					change_seq: 1,
					base_seq: null,
					deleted: false,
					// Firma robada a propósito: el servidor la tiene que pisar.
					payload: { id: 'linea-del-invitado', noteId: NOTA_DE_A, actor: 'user', action: 'done' }
				}
			]
		})
	);
	assert.deepEqual(aceptado, [], 'el invitado no pudo agregar una línea de bitácora');
	const bajada = unwrap(
		await b.client.rpc('pull_shared_rows', { p_note_id: NOTA_DE_A, p_cursor: 0 })
	);
	const firmada = bajada.find((row) => row.id === 'linea-del-invitado');
	assert.equal(firmada.payload.actor, `member:${b.id}`, 'el invitado firmó su línea como el dueño');
	console.log('✓ el invitado sólo agrega bitácora, y la firma se la pone el servidor');

	// La invitación de verdad (parte B1). Va sobre una nota TERCERA y no sobre
	// `NOTA_DE_A`, porque ahí arriba la membresía se plantó con la llave de
	// servicio: canjear un token sobre una membresía que ya existe es un no-op y
	// no probaría nada.
	const NOTA_INVITADA = 'nota-con-invitacion-de-A';
	unwrap(await a.client.rpc('open_share', { p_note_id: NOTA_INVITADA }));

	// 14. Sólo el dueño reparte. La comprobación de `create_share_invite` va
	//     contra `shares` y no contra `is_share_participant` justamente para
	//     dejar afuera a los invitados; sin esa diferencia, cualquier invitado
	//     podría repartir la nota de otro a quien quisiera.
	await assert.rejects(
		async () =>
			unwrap(
				await b.client.rpc('create_share_invite', {
					p_note_id: NOTA_INVITADA,
					p_member_label: 'colado',
					p_owner_label: 'colado'
				})
			),
		'un invitado pudo generar un link de invitación de una nota ajena'
	);
	console.log('✓ sólo el dueño invita');

	// 15. Un token inventado no abre nada. Es el caso que decide si el link es un
	//     secreto o una sugerencia.
	await assert.rejects(
		async () => unwrap(await b.client.rpc('accept_share_invite', { p_token: 'no-existe' })),
		'un token inventado fue aceptado'
	);
	console.log('✓ un token inventado no da acceso');

	// 16. El canje bueno: B entra por la puerta y se lleva el nombre que le puso
	//     A. Y `list_shares` le tiene que devolver el nombre del DUEÑO, que es lo
	//     único que el invitado no puede averiguar de ninguna otra forma.
	const token = unwrap(
		await a.client.rpc('create_share_invite', {
			p_note_id: NOTA_INVITADA,
			p_member_label: 'Juan',
			p_owner_label: 'Hernán'
		})
	);
	assert.equal(
		unwrap(await b.client.rpc('accept_share_invite', { p_token: token })),
		NOTA_INVITADA,
		'aceptar la invitación no devolvió qué nota esperar'
	);
	const enQueEstaB = unwrap(await b.client.rpc('list_shares'));
	const comoInvitado = enQueEstaB.find((fila) => fila.note_id === NOTA_INVITADA);
	assert.equal(comoInvitado.role, 'member', 'el que aceptó no quedó como invitado');
	assert.equal(comoInvitado.counterpart_label, 'Hernán', 'el invitado no recibió el nombre del dueño');
	const miembros = unwrap(
		await a.client.from('share_members').select('display_name').eq('note_id', NOTA_INVITADA)
	);
	assert.deepEqual(
		miembros.map((fila) => fila.display_name),
		['Juan'],
		'el dueño no ve el nombre que le puso al invitado'
	);
	console.log('✓ el canje del token deja la membresía y los dos nombres');

	// 17. El invitado no echa a nadie, ni siquiera usando la puerta del dueño. La
	//     suya es `leave_share`, que no toma a quién — un parámetro que sólo puede
	//     valer `auth.uid()` es un agujero esperando a que alguien lo llame con
	//     otra cosa. Y después de irse, deja de poder LEER: si esto fallara,
	//     quitar el acceso sería decorativo.
	await assert.rejects(
		async () =>
			unwrap(
				await b.client.rpc('remove_member', { p_note_id: NOTA_INVITADA, p_member_id: a.id })
			),
		'un invitado pudo quitarle el acceso al dueño'
	);
	// Con el invitado todavía adentro, la compartición NO está marcada. Este
	// control no es decorativo: es lo que separa "se quedó sin nadie" de "no hay
	// nadie", y sin él la marca podría estar puesta desde el minuto cero y la
	// prueba de abajo daría verde igual.
	const antesDeIrse = unwrap(await a.client.rpc('list_shares')).find(
		(fila) => fila.note_id === NOTA_INVITADA
	);
	assert.equal(antesDeIrse.emptied, false, 'la compartición nace marcada como vacía');

	unwrap(await b.client.rpc('leave_share', { p_note_id: NOTA_INVITADA }));
	assert.equal(
		unwrap(await b.client.rpc('list_shares')).filter((fila) => fila.note_id === NOTA_INVITADA)
			.length,
		0,
		'el invitado que se fue sigue figurando en list_shares'
	);
	await assert.rejects(
		async () =>
			unwrap(await b.client.rpc('pull_shared_rows', { p_note_id: NOTA_INVITADA, p_cursor: 0 })),
		'el invitado que se fue todavía puede leer la nota'
	);
	console.log('✓ sólo el dueño quita a alguien, y el invitado se va solo');

	// 18. Y al irse el último, la compartición le queda MARCADA al dueño. El
	//     servidor no la cierra: cerrar incluye resellar las filas de la nota para
	//     el caño cifrado, y eso sólo lo puede hacer el aparato del dueño
	//     (`src/lib/sync/share-move.ts`). Un `delete from shares` acá dejaría la
	//     nota sin ningún caño, sincronizando en silencio con nadie.
	const despuesDeIrse = unwrap(await a.client.rpc('list_shares')).find(
		(fila) => fila.note_id === NOTA_INVITADA
	);
	assert.equal(
		despuesDeIrse.emptied,
		true,
		'el último invitado se fue y la compartición no quedó marcada'
	);
	//     Y la marca se levanta cuando entra alguien, o una compartición que se
	//     vació y volvió a llenarse antes de que el dueño abriera la app se
	//     cerraría igual, dejando afuera al que acaba de entrar.
	const tokenDeVuelta = unwrap(
		await a.client.rpc('create_share_invite', {
			p_note_id: NOTA_INVITADA,
			p_member_label: 'Juan',
			p_owner_label: 'Hernán'
		})
	);
	unwrap(await b.client.rpc('accept_share_invite', { p_token: tokenDeVuelta }));
	const despuesDeVolver = unwrap(await a.client.rpc('list_shares')).find(
		(fila) => fila.note_id === NOTA_INVITADA
	);
	assert.equal(despuesDeVolver.emptied, false, 'entró alguien y la marca de vacía no se levantó');
	console.log('✓ el último que se va deja la marca, y el que entra la levanta');

	// Se va de nuevo, así lo que sigue encuentra el mismo estado que antes.
	unwrap(await b.client.rpc('leave_share', { p_note_id: NOTA_INVITADA }));

	// 19. La mitad que faltaba de la mudanza. Las dos cuentas tienen una fila con
	//     el MISMO id, así que si `delete_records` borrara por id en vez de por
	//     dueño, esta llamada se llevaría puesta la de B.
	unwrap(await a.client.rpc('delete_records', { payload: [{ table_name: 'notes', id: SHARED_ID }] }));
	const sobrevivioB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(sobrevivioB[0].blob), 'secreto-de-B', 'delete_records de A borró la fila de B');
	const seFueDeA = unwrap(await a.client.from('records').select('id'));
	assert.equal(seFueDeA.length, 0, 'delete_records no borró la fila de quien lo llamó');
	console.log('✓ delete_records borra lo propio y no alcanza lo ajeno');

	// Repuesta, así la prueba siguiente tiene algo que vaciar.
	await push(a.client, [{ ...record('secreto-de-A-v3'), change_seq: 10, base_seq: null }]);

	// 20. Restaurar un respaldo vacía `records` de quien llama y nada más. Las dos
	//     cuentas tienen una fila con el MISMO id a propósito. Y la bóveda de A
	//     tiene que seguir en pie: si esto borrara `vaults`, restaurar un archivo
	//     costaría la llave, y por eso `reset_records` existe en vez de reusar
	//     `reset_cloud`.
	//
	//     A no tenía bóveda hasta acá —la de arriba es de B—, y hace falta que la
	//     tenga: el escenario es un aparato con llave que restaura un respaldo.
	unwrap(await a.client.from('vaults').insert({ iv: 'i', check_blob: 'prueba-de-A' }));
	unwrap(await a.client.rpc('reset_records'));
	const vacioDeA = unwrap(await a.client.from('records').select('id'));
	assert.equal(vacioDeA.length, 0, 'reset_records no vació lo de quien lo llamó');
	const intactoDeB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(intactoDeB[0].blob), 'secreto-de-B', 'reset_records de A borró la fila de B');
	const bovedaDeA = unwrap(await a.client.from('vaults').select('check_blob'));
	assert.equal(bovedaDeA.length, 1, 'reset_records se llevó la bóveda de A');
	assert.equal(bovedaDeA[0].check_blob, 'prueba-de-A', 'reset_records pisó la bóveda de A');
	console.log('✓ reset_records vacía lo propio, no lo ajeno, y no toca la bóveda');

	// Repuesta otra vez, así `reset_cloud` tiene algo que vaciar.
	await push(a.client, [{ ...record('secreto-de-A-v4'), change_seq: 11, base_seq: null }]);

	// 21. Empezar de nuevo borra lo propio y nada de lo ajeno. Es la única puerta
	//     de borrado que existe, así que si filtrara mal, vaciaría cuentas ajenas.
	unwrap(await a.client.rpc('reset_cloud'));
	const deA = unwrap(await a.client.from('records').select('id'));
	assert.equal(deA.length, 0, 'reset_cloud no borró lo de quien lo llamó');
	const deB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(deB[0].blob), 'secreto-de-B', 'reset_cloud de A se llevó puesto lo de B');
	const bovedaDeB = unwrap(await b.client.from('vaults').select('check_blob'));
	assert.equal(bovedaDeB.length, 1, 'reset_cloud de A borró la bóveda de B');
	// Y cierra lo compartido, o la nota queda publicada acá arriba mientras el
	// aparato deja de creerla compartida: una nota en los dos caños para siempre.
	const compartidasDeA = unwrap(await a.client.from('shares').select('note_id'));
	assert.deepEqual(compartidasDeA, [], 'empezar de nuevo dejó abierta una nota compartida de A');
	const compartidasDeB = unwrap(await b.client.from('shares').select('note_id'));
	assert.deepEqual(
		compartidasDeB.map((row) => row.note_id),
		[NOTA_DE_B],
		'reset_cloud de A cerró la nota compartida de B'
	);
	const filasDeB = unwrap(await b.client.from('share_rows').select('id'));
	assert.deepEqual(
		filasDeB.map((row) => row.id),
		['b-de-B'],
		'reset_cloud de A se llevó las filas compartidas de B'
	);
	console.log('✓ empezar de nuevo vacía lo propio y no toca lo ajeno');

	console.log('\nCandado OK: las veintiuna pruebas pasaron.');
} finally {
	// on delete cascade takes the rows with the users.
	await admin.auth.admin.deleteUser(a.id);
	await admin.auth.admin.deleteUser(b.id);
	console.log('· cuentas de prueba borradas');
}
