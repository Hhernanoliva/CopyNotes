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
	unwrap(
		await a.client
			.from('pairings')
			.insert({ salt: 's-de-A', iv: 'i-de-A', wrapped: 'llave-de-A', expires_at: enDiezMinutos })
	);
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
	unwrap(await a.client.from('pairings').delete().eq('owner_id', a.id));
	unwrap(
		await a.client.from('pairings').insert({
			salt: 's-vieja',
			iv: 'i-vieja',
			wrapped: 'llave-vencida',
			expires_at: new Date(Date.now() - 1000).toISOString()
		})
	);
	const vencida = unwrap(await a.client.from('pairings').select('wrapped'));
	assert.deepEqual(vencida, [], 'una llave de paso vencida se pudo leer');
	// Y se puede borrar aunque esté vencida, o bloquearía para siempre la próxima:
	// la clave primaria es el dueño.
	unwrap(await a.client.from('pairings').delete().eq('owner_id', a.id));
	unwrap(
		await a.client
			.from('pairings')
			.insert({ salt: 's2', iv: 'i2', wrapped: 'llave-nueva', expires_at: enDiezMinutos })
	);
	console.log('✓ la llave de paso vencida no se lee, pero sí se puede reemplazar');

	// 11. Empezar de nuevo borra lo propio y nada de lo ajeno. Es la única puerta
	//     de borrado que existe, así que si filtrara mal, vaciaría cuentas ajenas.
	unwrap(await a.client.rpc('reset_cloud'));
	const deA = unwrap(await a.client.from('records').select('id'));
	assert.equal(deA.length, 0, 'reset_cloud no borró lo de quien lo llamó');
	const deB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(deB[0].blob), 'secreto-de-B', 'reset_cloud de A se llevó puesto lo de B');
	const bovedaDeB = unwrap(await b.client.from('vaults').select('check_blob'));
	assert.equal(bovedaDeB.length, 1, 'reset_cloud de A borró la bóveda de B');
	console.log('✓ empezar de nuevo vacía lo propio y no toca lo ajeno');

	console.log('\nCandado OK: las once pruebas pasaron.');
} finally {
	// on delete cascade takes the rows with the users.
	await admin.auth.admin.deleteUser(a.id);
	await admin.auth.admin.deleteUser(b.id);
	console.log('· cuentas de prueba borradas');
}
