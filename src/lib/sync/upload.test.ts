// The upload loop against a fake server. What is being proved here is not that
// Supabase works, but the three promises spec 030 makes about it: nothing leaves
// without consent, what leaves is unreadable, and a failure never loses or
// duplicates a record.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote, updateNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { appendActivity } from '../storage/activity';
import { setShareRole } from '../storage/shares';
import { grantUploadConsent, uploadedThrough } from './pending';
import { createVault } from './vault';
import { setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

// Every request the fake server received: [table, rows].
const sent = vi.hoisted(() => []);
// Queue of replies; empty means "everything worked".
const replies = vi.hoisted(() => []);
// What the server answers when asked whether this account already has a vault.
const serverVault = vi.hoisted(() => ({ row: null }));
// `table:id` of the records this server refuses, standing in for "somebody else
// wrote a version you never saw".
const rejects = vi.hoisted(() => []);
// En qué notas compartidas dice el servidor que está este aparato (spec 038).
const serverShares = vi.hoisted(() => []);
// Lo que el caño compartido tiene para bajar.
const sharedRows = vi.hoisted(() => []);

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		// Records go up through the guarded function, never a bare upsert: it is the
		// only writer that can refuse. It answers with the rows it refused.
		rpc: async (name, args) => {
			// Spec 038: `syncNow` pregunta primero en qué notas compartidas está este
			// aparato. El caño compartido tiene su propia prueba (shared.test.ts); lo
			// que hace falta acá es que la pregunta se pueda contestar sin comerse
			// una respuesta de la cola de arriba ni contar como subida cifrada.
			if (name === 'list_shares') return { data: serverShares, error: null };
			if (name === 'pull_shared_rows') return { data: sharedRows, error: null };
			// Y que lo que se le mande NO se le acepte solo, o la cola compartida
			// quedaría siempre vacía justo cuando se la cuenta al final.
			if (name === 'push_shared_rows') {
				return {
					data: args.payload.map((row) => ({
						rejected_table: row.table_name,
						rejected_id: row.id
					})),
					error: null
				};
			}
			if (name !== 'push_records') return { data: [], error: null };
			sent.push(['records', args.payload]);
			const reply = replies.shift();
			if (reply?.error) return { data: null, error: reply.error };
			return {
				data: args.payload
					.filter((row) => rejects.includes(`${row.table_name}:${row.id}`))
					.map((row) => ({ rejected_table: row.table_name, rejected_id: row.id })),
				error: null
			};
		},
		from: (table) => ({
			// `insert`, nunca `upsert`: el candado sólo deja crear la bóveda, no
			// pisarla (supabase/schema.sql). La primera que llega gana, y la segunda
			// choca contra la clave primaria.
			insert: async (rows) => {
				sent.push([table, rows]);
				return replies.shift() ?? { error: null };
			},
			// Two readers hang off select(): `maybeSingle` for the account's wrapped
			// vault key, and the gt/order/limit chain the download loop uses. This
			// fake server never has anything to send down — the merge itself is
			// covered in download.test.ts.
			select: () => ({
				maybeSingle: async () => ({ data: serverVault.row, error: null }),
				gt: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) })
			})
		})
	})
}));

// Fresh module graph per test: `upload.ts` remembers whether it already sent the
// wrapped vault key, and that memory is part of what is under test.
async function loadUpload() {
	vi.resetModules();
	const [upload, status] = await Promise.all([import('./upload'), import('./status.svelte')]);
	return {
		syncNow: upload.syncNow,
		startUploadClock: upload.startUploadClock,
		cloudVaultExists: upload.cloudVaultExists,
		syncStatus: status.syncStatus
	};
}

function rowsFor(table) {
	return sent.filter(([name]) => name === table).flatMap(([, rows]) => rows);
}

beforeEach(async () => {
	sent.length = 0;
	replies.length = 0;
	rejects.length = 0;
	serverShares.length = 0;
	sharedRows.length = 0;
	serverVault.row = null;
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('a second device', () => {
	it('can tell that the account already has a vault, so it never creates a rival one', async () => {
		// Two vaults on one account means two different keys, and from then on each
		// device uploads records the other cannot decrypt. Joining an existing vault
		// with the recovery code is phase 3; until then the screen must refuse.
		const { cloudVaultExists } = await loadUpload();

		expect(await cloudVaultExists()).toBe(false);

		serverVault.row = { owner_id: 'cuenta-1' };
		expect(await cloudVaultExists()).toBe(true);
	});
});

// El agujero que esto cierra: dos aparatos podían comprobar a la vez que la
// cuenta no tenía bóveda, crear cada uno la suya con una llave distinta, y subir
// las dos con `upsert`. Ganaba la última. Desde ese momento cada aparato subía
// registros que el otro no podía abrir, y la llave del que perdió la carrera
// quedaba muerta — sin que nadie dijera nada.
describe('cuando la cuenta ya tiene una bóveda de otro aparato', () => {
	it('para y lo dice, en vez de pisar la llave del otro', async () => {
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		// Lo que contesta Postgres cuando ya hay una fila con ese dueño.
		replies.push({
			error: { code: '23505', message: 'duplicate key value violates unique constraint' }
		});
		// Y la prueba que hay arriba es de OTRA llave: esta bóveda no la abre. Eso
		// es lo único que distingue este caso del de abajo (spec 035).
		serverVault.row = { iv: btoa('123456789012'), check_blob: btoa('de-otra-llave') };
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		expect(syncStatus.error).toBe(
			'Esta cuenta ya tiene una bóveda creada en otro aparato. Sumá este aparato con el código que muestra el otro.'
		);
		// Y no sube nada: cifrado con una llave que la cuenta no tiene, cada
		// registro sería un bulto que después nadie puede abrir.
		expect(rowsFor('records')).toEqual([]);
	});

	// Y el otro lado de esa misma respuesta, que es el que faltaba: la fila que
	// hay arriba puede ser de ESTE aparato. El servidor contesta lo mismo en los
	// dos casos, así que hay que mirar cuál es.
	it('no confunde su propia bóveda, de la corrida anterior, con la de otro', async () => {
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		const first = await loadUpload();
		await first.syncNow();
		// Lo que este aparato dejó arriba la primera vez que se abrió la app.
		serverVault.row = rowsFor('vaults')[0];
		sent.length = 0;

		// Segunda corrida: el módulo arranca sin memoria de haberla subido, así que
		// reintenta el insert y choca contra su propia fila.
		replies.push({
			error: { code: '23505', message: 'duplicate key value violates unique constraint' }
		});
		await createNote({ title: 'dos' });
		const second = await loadUpload();

		await second.syncNow();

		// Sin esto, un aparato sano se acusaba a sí mismo de ser el segundo y dejaba
		// de subir para siempre, desde la segunda vez que se abría la app.
		expect(second.syncStatus.error).toBe(null);
		expect(rowsFor('records').length).toBeGreaterThan(0);
	});
});

describe('the consent gate', () => {
	it('sends nothing at all before the user consents', async () => {
		// A vault cannot be created without consent any more, so this is the state a
		// *second* device is in: it joined the existing vault with the recovery code
		// — which needs no consent, because downloading is what it asked for — and
		// has not said yet whether its own writing may go up.
		await grantUploadConsent();
		await createVault();
		await setSetting(KEY.syncConsent, false);
		await createNote({ title: 'privada' });
		const { syncNow } = await loadUpload();

		await syncNow();

		expect(sent).toEqual([]);
		expect(await uploadedThrough()).toBe(0);
	});

	it('sends nothing while there is no vault, because there is no key to encrypt with', async () => {
		await grantUploadConsent();
		await createNote({ title: 'privada' });
		const { syncNow } = await loadUpload();

		await syncNow();

		expect(sent).toEqual([]);
	});
});

describe('what reaches the server', () => {
	it('uploads every pending record as an unreadable blob', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'Reunión con el contador' });
		await createBlock({ noteId: note.id, content: 'Pedir el balance de marzo' });
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		const records = rowsFor('records');
		expect(records).toHaveLength(2);
		expect(records.map((row) => row.table_name)).toEqual(['notes', 'blocks']);
		expect(records[0].id).toBe(note.id);
		// The whole payload, exactly as it would travel on the wire.
		const wire = JSON.stringify(records);
		expect(wire).not.toContain('Reunión con el contador');
		expect(wire).not.toContain('Pedir el balance de marzo');
		expect(syncStatus.pending).toBe(0);
		expect(syncStatus.error).toBe(null);
	});

	it('sends the wrapped vault key once, not on every sync', async () => {
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		const { syncNow } = await loadUpload();

		await syncNow();
		await createNote({ title: 'otra' });
		await syncNow();

		expect(rowsFor('vaults')).toHaveLength(1);
		expect(rowsFor('vaults')[0]).not.toHaveProperty('key');
		// Two record uploads, one per note. Creating a note used to renumber every
		// sibling above it, and a renumbered row is a changed row, so one new note
		// re-uploaded the whole sidebar. A new row now takes a position below the
		// lowest one instead (spec 030's "stable positions"), so nothing it did not
		// touch is sent.
		expect(rowsFor('records')).toHaveLength(2);
	});
});

describe('the clock', () => {
	it('never syncs synchronously, so the $effect that starts it cannot loop', async () => {
		// Regression: `syncNow` reads and writes `syncStatus`. Started synchronously
		// from a Svelte effect, that read became a dependency and the write
		// re-triggered the effect for ever, freezing the tab. Nothing may reach the
		// status — or the network — before the caller's effect has finished.
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		const { startUploadClock, syncStatus } = await loadUpload();

		const stop = startUploadClock();

		expect(syncStatus.uploading).toBe(false);
		expect(sent).toEqual([]);
		stop();
	});
});

describe('when the network or the server fails', () => {
	it('keeps the mark where it was and shows the error', async () => {
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		replies.push({ error: null }); // the vault key lands
		replies.push({ error: { message: 'No hay conexión' } }); // the records do not
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		expect(await uploadedThrough()).toBe(0);
		expect(syncStatus.error).toBe('No se pudo sincronizar. Lo tuyo está guardado en este dispositivo.');
		expect(syncStatus.errorDetail).toBe('No hay conexión');
		expect(syncStatus.pending).toBe(1);
	});

	it('no pone el error del navegador en pantalla cuando no se llegó al servidor', async () => {
		await grantUploadConsent();
		await createVault();
		await createNote({ title: 'una' });
		replies.push({ error: null });
		// Lo que devuelve el navegador cuando la llamada ni salió: inglés y nombre
		// de tipo de dato. Eso no puede ser la línea que lee una persona.
		replies.push({ error: { message: 'TypeError: Failed to fetch' } });
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		// Sin conexión no es una falla: es un estado, y sin nada perdido.
		expect(syncStatus.offline).toBe(true);
		expect(syncStatus.error).toBe(null);
		// El detalle técnico no se tira: queda para reportar un problema.
		expect(syncStatus.errorDetail).toBe('TypeError: Failed to fetch');
		expect(syncStatus.pending).toBe(1);
	});

	it('retries the same batch on the next run instead of losing or duplicating it', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'una' });
		replies.push({ error: null });
		replies.push({ error: { message: 'No hay conexión' } });
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();
		await syncNow();

		const records = rowsFor('records');
		expect(records).toHaveLength(2); // the same record, sent twice
		expect(records[0].id).toBe(note.id);
		expect(records[1].id).toBe(note.id);
		// Same primary key, so the second send overwrites instead of duplicating.
		expect(records[1].table_name).toBe(records[0].table_name);
		expect(await uploadedThrough()).toBe(records[1].change_seq);
		expect(syncStatus.pending).toBe(0);
		expect(syncStatus.error).toBe(null);
	});
});

// The hole this closes: the upload used to be a blind upsert. Two devices that
// each edited the same note offline both "won" — the second one overwrote a
// version it had never seen, and neither device ever noticed. The parked-conflict
// machinery was already built and simply unreachable, because the losing version
// was destroyed on the server before anything could compare the two.
describe('when the other device got there first', () => {
	it('declares which version it is standing on, so the server can tell', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'una' });
		const { syncNow } = await loadUpload();

		await syncNow();
		const [first] = rowsFor('records');
		// Nothing of mine up there yet: this device stands on no server version, and
		// the write may only land if the record is genuinely new.
		expect(first.base_seq).toBe(null);

		await updateNote(note.id, { title: 'otra' });
		await syncNow();

		const second = rowsFor('records').at(-1);
		expect(second.base_seq).toBe(first.change_seq);
		expect(second.change_seq).toBeGreaterThan(first.change_seq);
	});

	it('leaves a refused record pending instead of pretending it landed', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'mía' });
		const { syncNow, syncStatus } = await loadUpload();
		rejects.push(`notes:${note.id}`);

		await syncNow();

		// Not marked as sent, in any of the three places that would hide it. The
		// mark stops just below the refused record rather than at zero: everything
		// older really did land, and re-scanning it would be pure waste.
		const stored = await db.table('notes').get(note.id);
		expect(await uploadedThrough()).toBeLessThan(stored.changeSeq);
		expect(syncStatus.pending).toBe(1);
		expect(stored.cloudSeq).toBeUndefined();
	});

	it('does not drag down the records that landed in the same batch', async () => {
		await grantUploadConsent();
		await createVault();
		const first = await createNote({ title: 'primera' });
		const second = await createNote({ title: 'segunda' });
		const { syncNow } = await loadUpload();
		rejects.push(`notes:${first.id}`);

		await syncNow();
		await syncNow();

		const ids = rowsFor('records').map((row) => row.id);
		// The one that landed is confirmed and never sent again; the refused one
		// keeps trying, and the download turns it into a decision for the person.
		expect(ids.filter((id) => id === second.id)).toHaveLength(1);
		expect(ids.filter((id) => id === first.id)).toHaveLength(2);
	});

	it('never re-sends what the server confirmed', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'una' });
		const { syncNow } = await loadUpload();

		await syncNow();
		await syncNow();

		expect(rowsFor('records')).toHaveLength(1);
		const stored = await db.table('notes').get(note.id);
		expect(stored.cloudSeq).toBe(stored.changeSeq);
	});
});

// Spec 038. La línea "Todo subido" es el ÚNICO testigo del gate manual de dos
// aparatos, así que no puede mentirle a un invitado: no tiene permiso de subir
// ni bóveda, con lo cual el caño cifrado contesta cero — correctamente, es su
// puerta — y sus tildes sin mandar quedaban invisibles.
describe('lo que falta subir son dos colas', () => {
	it('cuenta la compartida aunque no haya permiso de subir', async () => {
		const note = await createNote({ title: 'ajena' });
		await setShareRole(note.id, 'member');
		await appendActivity({
			blockId: 'b1',
			noteId: note.id,
			actor: 'user',
			action: 'done',
			text: ''
		});
		serverShares.push({ note_id: note.id, role: 'member' });
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		expect(syncStatus.pending).toBe(1);
	});

	// El bug que encontró el gate manual del 2026-08-14: la edición del otro
	// aparato aterrizaba en la base y la pantalla no se enteraba, porque
	// `appliedVersion` —lo único que `CloudLifecycle` mira para decir "refrescá"—
	// lo movía sólo el caño cifrado. Las dos mitades estaban probadas por
	// separado; lo que faltaba era el cable entre ellas.
	it('avisa a la pantalla cuando algo llegó por el caño compartido', async () => {
		const note = await createNote({ title: 'vieja' });
		await setShareRole(note.id, 'owner');
		serverShares.push({ note_id: note.id, role: 'owner' });
		sharedRows.push({
			table_name: 'notes',
			id: note.id,
			change_seq: 9_999_999_999_999,
			deleted: false,
			payload: { id: note.id, title: 'la escribió el otro aparato', deletedAt: null },
			author_id: 'u1',
			server_seq: 3
		});
		const { syncNow, syncStatus } = await loadUpload();
		const antes = syncStatus.appliedVersion;

		await syncNow();

		expect((await db.table('notes').get(note.id)).title).toBe('la escribió el otro aparato');
		expect(syncStatus.appliedVersion).toBe(antes + 1);
	});
});

// Criterio 24 de la spec 038, el que faltaba: una nota compartida NO se sube al
// caño cifrado después de restaurar un respaldo.
//
// La marca de compartida no viaja en el archivo a propósito (`LOCAL_ONLY_FIELDS`:
// un archivo no puede afirmar que una nota está compartida). Entonces, recién
// restaurado, este aparato tiene la nota entera como pendiente y sin marca — la
// misma situación que un aparato nuevo o uno que acaba de cerrar sesión. Si
// `uploadBatch` corriera antes de preguntarle al servidor qué está compartido, la
// nota terminaría en los DOS caños, y su texto quedaría en `records` cifrado con la
// llave de una cuenta cuando el punto entero de la spec 038 es que viaje por uno solo.
//
// Lo único que lo evita es el ORDEN dentro de `syncNow`, y hasta acá el orden no
// tenía prueba: estaba sostenido por un comentario.
describe('restaurar un respaldo no manda la nota compartida por el caño cifrado', () => {
	it('la primera pasada no sube ni la nota ni sus renglones', async () => {
		await grantUploadConsent();
		await createVault();
		const note = await createNote({ title: 'compartida' });
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'texto', order: 0 });
		// Sin `setShareRole`: eso es exactamente lo que "Reemplazar todo" deja atrás.
		serverShares.push({ note_id: note.id, role: 'owner' });
		const { syncNow } = await loadUpload();

		await syncNow();

		const subido = sent.flatMap(([, payload]) => payload).map((row) => `${row.table_name}:${row.id}`);
		expect(subido).not.toContain(`notes:${note.id}`);
		expect(subido).not.toContain(`blocks:${block.id}`);
	});

	// La otra mitad, o la prueba de arriba pasaría con una subida que no sube nada.
	it('y una nota que NO está compartida sí se sube en la misma pasada', async () => {
		await grantUploadConsent();
		await createVault();
		const compartida = await createNote({ title: 'compartida' });
		const propia = await createNote({ title: 'mía' });
		serverShares.push({ note_id: compartida.id, role: 'owner' });
		const { syncNow } = await loadUpload();

		await syncNow();

		const subido = sent.flatMap(([, payload]) => payload).map((row) => `${row.table_name}:${row.id}`);
		expect(subido).toContain(`notes:${propia.id}`);
		expect(subido).not.toContain(`notes:${compartida.id}`);
	});
});
