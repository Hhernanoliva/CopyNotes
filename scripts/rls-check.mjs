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

try {
	unwrap(await a.client.from('records').insert(record('secreto-de-A')));
	unwrap(await b.client.from('records').insert(record('secreto-de-B')));
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

	// 3. Planting a row in someone else's name must be refused by the server.
	const planted = await a.client.from('records').insert({ ...record('inyectado'), owner_id: b.id });
	assert(planted.error, 'A pudo insertar una fila a nombre de B');
	console.log(`✓ A no puede insertar a nombre de B (${planted.error.code})`);

	// 4. Overwriting the other account's row silently changes nothing.
	unwrap(
		await a.client.from('records').update({ blob: btoa('pisado') }).eq('table_name', 'notes')
	);
	const stillB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(stillB[0].blob), 'secreto-de-B', 'A pudo sobrescribir la fila de B');
	console.log('✓ A no puede sobrescribir la fila de B');

	// 5. The vault key blob is locked the same way.
	unwrap(await b.client.from('vaults').insert({ salt: 's', iv: 'i', wrapped: 'w' }));
	const vaults = unwrap(await a.client.from('vaults').select('owner_id'));
	assert.equal(vaults.length, 0, 'A pudo leer la bóveda envuelta de B');
	console.log('✓ A no puede leer la llave envuelta de B');

	// 6. The exact call `sync/upload.ts` makes. Records go up through
	//    `push_records`, never a bare upsert, because it is the only writer that
	//    can refuse one. Standing on the version the server holds overwrites;
	//    standing on a stale one is refused and changes nothing.
	const push = async (client, payload) => unwrap(await client.rpc('push_records', { payload }));
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

	console.log('\nCandado OK: las siete pruebas pasaron.');
} finally {
	// on delete cascade takes the rows with the users.
	await admin.auth.admin.deleteUser(a.id);
	await admin.auth.admin.deleteUser(b.id);
	console.log('· cuentas de prueba borradas');
}
