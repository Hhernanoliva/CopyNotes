// Cerrar sesión (spec 030). The promise: the notes stay on this device, and
// everything that belonged to the account that is leaving does not.
//
// The hole this closes is the second half. `signOut()` alone left the vault key,
// the upload consent and both cursors in place, so signing into a *different*
// account started uploading without ever asking again, and read from the new
// server starting at the old account's cursor — silently skipping everything
// before it.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, SYNCED_TABLES } from '../storage/db';
import { createNote } from '../storage/notes';
import { createVault, hasVault } from './vault';
import { grantUploadConsent, hasUploadConsent, listPendingUploads, uploadedThrough } from './pending';
import { downloadedThrough } from './download';
import { countConflicts, recordConflict } from './conflicts';
import { setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

const store = new Map();
globalThis.localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => {
		store.set(key, String(value));
	},
	removeItem: (key) => {
		store.delete(key);
	},
	clear: () => store.clear(),
	key: (index) => [...store.keys()][index] ?? null,
	get length() {
		return store.size;
	}
};

const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({}),
	signOut
}));

const { forgetCloudAccount } = await import('./leave');

// A device that has been syncing for a while: vault, consent, both cursors
// moved, a decision waiting, and a note that the server already holds.
async function aConnectedDevice() {
	await grantUploadConsent();
	await createVault();
	await setSetting(KEY.syncUploadedThrough, 5_000);
	await setSetting(KEY.syncDownloadedThrough, 42);
	const note = await createNote({ title: 'mía' });
	const stored = await db.table('notes').get(note.id);
	await db.table('notes').update(note.id, { cloudSeq: stored.changeSeq, fromCloud: true });
	await recordConflict('notes', { ...stored, title: 'la de allá' });
	return note.id;
}

beforeEach(async () => {
	signOut.mockClear();
	store.clear();
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('cerrar sesión', () => {
	it('leaves the notes exactly where they are', async () => {
		const id = await aConnectedDevice();

		await forgetCloudAccount();

		expect((await db.table('notes').get(id)).title).toBe('mía');
		expect(await db.table('notes').count()).toBe(1);
		expect(signOut).toHaveBeenCalled();
	});

	it('takes the leaving account with it: key, consent, cursors and pending decisions', async () => {
		await aConnectedDevice();

		await forgetCloudAccount();

		// The key: without dropping it, the next account would keep encrypting with
		// the previous one's, and its own wrapped copy would never be joined.
		expect(await hasVault()).toBe(false);
		// The consent: this is the one that made a new account start uploading
		// without ever being asked.
		expect(await hasUploadConsent()).toBe(false);
		// The cursors: they count in the previous server's numbers, and starting a
		// new account partway through its history skips the rest for ever.
		expect(await uploadedThrough()).toBe(0);
		expect(await downloadedThrough()).toBe(0);
		// A decision about two versions of a record on an account nobody is in.
		expect(await countConflicts()).toBe(0);
	});

	it('lets the notes travel again, instead of counting them as already uploaded', async () => {
		// Each row remembers which version the old server held. Left behind, a row
		// whose remembered version still matches counts as "already up there" and
		// would never be sent to the new account — silently, for ever.
		const id = await aConnectedDevice();

		await forgetCloudAccount();
		await grantUploadConsent();

		expect((await db.table('notes').get(id)).cloudSeq).toBeUndefined();
		expect((await listPendingUploads()).map((entry) => entry.row.id)).toContain(id);
	});

	it('does not renumber the notes on the way out', async () => {
		// Clearing the remembered server version is bookkeeping, not an edit. If it
		// bumped the change counter, every row on the device would look freshly
		// written and the bitácora order would be rewritten by a sign-out.
		const id = await aConnectedDevice();
		const before = (await db.table('notes').get(id)).changeSeq;

		await forgetCloudAccount();

		expect((await db.table('notes').get(id)).changeSeq).toBe(before);
	});

	it('shuts the upload gate first, so a failure halfway cannot leave it open', async () => {
		await aConnectedDevice();
		signOut.mockRejectedValueOnce(new Error('No hay conexión'));

		await expect(forgetCloudAccount()).rejects.toThrow('No hay conexión');

		// Signing out did not reach the server, but nothing of this device's may go
		// up to that account any more either.
		expect(await hasUploadConsent()).toBe(false);
		expect(await hasVault()).toBe(false);
	});

	it('is a door every synced table goes through', async () => {
		// A table added to SYNCED_TABLES later carries `cloudSeq` too, and would be
		// stranded the same way.
		await grantUploadConsent();
		await createVault();
		for (const name of SYNCED_TABLES) {
			await db.table(name).put({ id: `x-${name}`, changeSeq: 10, cloudSeq: 10, fromCloud: true });
		}

		await forgetCloudAccount();

		for (const name of SYNCED_TABLES) {
			expect((await db.table(name).get(`x-${name}`)).cloudSeq).toBeUndefined();
		}
	});
});
