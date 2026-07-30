// The upload loop against a fake server. What is being proved here is not that
// Supabase works, but the three promises spec 030 makes about it: nothing leaves
// without consent, what leaves is unreadable, and a failure never loses or
// duplicates a record.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { grantUploadConsent, uploadedThrough } from './pending';
import { createVault } from './vault';

// Every request the fake server received: [table, rows].
const sent = vi.hoisted(() => []);
// Queue of replies; empty means "everything worked".
const replies = vi.hoisted(() => []);
// What the server answers when asked whether this account already has a vault.
const serverVault = vi.hoisted(() => ({ row: null }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		from: (table) => ({
			upsert: async (rows) => {
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

describe('the consent gate', () => {
	it('sends nothing at all before the user consents', async () => {
		await createVault();
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
		await createVault();
		await grantUploadConsent();
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
		await createVault();
		await grantUploadConsent();
		await createNote({ title: 'una' });
		const { syncNow } = await loadUpload();

		await syncNow();
		await createNote({ title: 'otra' });
		await syncNow();

		expect(rowsFor('vaults')).toHaveLength(1);
		expect(rowsFor('vaults')[0]).not.toHaveProperty('key');
		// Three record uploads, not two: creating a note calls shiftRootDown, which
		// renumbers the notes above it, and a renumbered row is a changed row. Spec
		// 030 phase 3 already names the fix (stable positions instead of sequential
		// `sortOrder` integers); until then a new note re-uploads its siblings'
		// small rows.
		expect(rowsFor('records')).toHaveLength(3);
	});
});

describe('the clock', () => {
	it('never syncs synchronously, so the $effect that starts it cannot loop', async () => {
		// Regression: `syncNow` reads and writes `syncStatus`. Started synchronously
		// from a Svelte effect, that read became a dependency and the write
		// re-triggered the effect for ever, freezing the tab. Nothing may reach the
		// status — or the network — before the caller's effect has finished.
		await createVault();
		await grantUploadConsent();
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
		await createVault();
		await grantUploadConsent();
		await createNote({ title: 'una' });
		replies.push({ error: null }); // the vault key lands
		replies.push({ error: { message: 'No hay conexión' } }); // the records do not
		const { syncNow, syncStatus } = await loadUpload();

		await syncNow();

		expect(await uploadedThrough()).toBe(0);
		expect(syncStatus.error).toBe('No hay conexión');
		expect(syncStatus.pending).toBe(1);
	});

	it('retries the same batch on the next run instead of losing or duplicating it', async () => {
		await createVault();
		await grantUploadConsent();
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
