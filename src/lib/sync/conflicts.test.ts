// "Lo edité en los dos lados" (spec 030 phase 3). The promise under test is the
// one the spec puts above every other: no conflict is ever resolved by a silent
// last-write-wins, and neither version disappears before the person chooses.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, SYNCED_TABLES } from '../storage/db';
import { dumpAllTables } from '../storage/backup';
import { createNote, updateNote } from '../storage/notes';
import { encryptRecord } from './records';
import { createVault, getVaultKey } from './vault';
import { grantUploadConsent, listPendingUploads } from './pending';
import { countConflicts, keepLocal, listConflicts, takeRemote, undoDecision } from './conflicts';

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

const server = vi.hoisted(() => ({ rows: [], error: null }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		from: () => {
			let cursor = 0;
			const query = {
				select: () => query,
				gt: (_column, value) => {
					cursor = value;
					return query;
				},
				order: () => query,
				limit: async (max) =>
					server.error
						? { data: null, error: server.error }
						: {
								data: server.rows.filter((row) => row.server_seq > cursor).slice(0, max),
								error: null
							}
			};
			return query;
		}
	})
}));

const { downloadOnce } = await import('./download');

async function publish(row, { table = 'notes', changeSeq, serverSeq }) {
	const payload = await encryptRecord(await getVaultKey(), table, { ...row, changeSeq });
	server.rows.push({
		table_name: payload.table,
		id: payload.id,
		change_seq: payload.changeSeq,
		deleted: payload.deleted,
		iv: payload.iv,
		blob: payload.blob,
		server_seq: serverSeq
	});
}

// Both devices edit the same note: this one writes "mía" without uploading it,
// the other one publishes "de allá".
async function bothEdited({ remoteDeleted = false } = {}) {
	const note = await createNote({ title: 'original' });
	const stored = await db.table('notes').get(note.id);
	await publish(
		{ ...stored, title: 'versión de allá', deletedAt: remoteDeleted ? '2026-07-30T12:00:00.000Z' : null },
		{ changeSeq: stored.changeSeq + 1_000, serverSeq: 1 }
	);
	await updateNote(note.id, { title: 'versión mía' });
	await downloadOnce();
	return note.id;
}

beforeEach(async () => {
	server.rows = [];
	server.error = null;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
	await createVault();
});

describe('when both devices edited the same record', () => {
	it('keeps both versions: mine in the note, theirs parked for me to decide', async () => {
		const id = await bothEdited();

		expect(await countConflicts()).toBe(1);
		expect((await db.table('notes').get(id)).title).toBe('versión mía');
		const [conflict] = await listConflicts();
		expect(conflict.remote.title).toBe('versión de allá');
		expect(conflict.table).toBe('notes');
	});

	it('parks a deletion from the other device instead of applying it', async () => {
		const id = await bothEdited({ remoteDeleted: true });

		// The edit wins over the delete until the person says otherwise.
		expect((await db.table('notes').get(id)).deletedAt).toBe(null);
		const [conflict] = await listConflicts();
		expect(conflict.remote.deletedAt).toBe('2026-07-30T12:00:00.000Z');
	});

	it('only remembers the newest version from the other side', async () => {
		const id = await bothEdited();
		const stored = await db.table('notes').get(id);
		await publish(
			{ ...stored, title: 'versión de allá, más nueva' },
			{ changeSeq: stored.changeSeq + 2_000, serverSeq: 2 }
		);

		await downloadOnce();

		expect(await countConflicts()).toBe(1);
		expect((await listConflicts())[0].remote.title).toBe('versión de allá, más nueva');
	});
});

describe('where a pending decision lives', () => {
	it('stays on this device: it is neither uploaded nor written into a backup', async () => {
		await bothEdited();

		const travelling = new Set((await listPendingUploads()).map((entry) => entry.table));
		expect(travelling.has('conflicts')).toBe(false);
		expect(SYNCED_TABLES).not.toContain('conflicts');
		// A decision pending here means nothing on another machine, and restoring
		// one would offer a choice about a record that no longer disagrees.
		expect(Object.keys(await dumpAllTables())).not.toContain('conflicts');
	});
});

describe('deciding', () => {
	it('"quedarme con lo mío" leaves my version on its way up', async () => {
		const id = await bothEdited();
		const [conflict] = await listConflicts();

		await keepLocal(conflict.id);

		expect(await countConflicts()).toBe(0);
		expect((await db.table('notes').get(id)).title).toBe('versión mía');
		// Still pending, so the other device ends up with my version.
		expect((await listPendingUploads()).map((entry) => entry.row.id)).toContain(id);
		// And standing on the other device's version, not on the one this device
		// last saw. The server refuses a write that is not based on what it holds,
		// so without this the upload would bounce for ever and the decision would
		// quietly never travel.
		expect((await db.table('notes').get(id)).cloudSeq).toBe(conflict.remote.changeSeq);
	});

	it('"traer la otra" replaces mine and does not bounce back up as a new change', async () => {
		const id = await bothEdited();
		const [conflict] = await listConflicts();

		await takeRemote(conflict.id);

		expect(await countConflicts()).toBe(0);
		expect((await db.table('notes').get(id)).title).toBe('versión de allá');
		expect(await listPendingUploads()).toEqual([]);
	});

	it('"traer la otra" se puede deshacer, y no deja rastro de haber pasado', async () => {
		// Deciding is now one tap, so the way back has to be one tap too. Undo must
		// put back the text, the parked version AND the version this row stands on:
		// forget the last and the next upload is refused for ever.
		const id = await bothEdited();
		const before = await db.table('notes').get(id);
		const [conflict] = await listConflicts();

		const undo = await takeRemote(conflict.id);
		expect((await db.table('notes').get(id)).title).toBe('versión de allá');

		await undoDecision(undo);

		const after = await db.table('notes').get(id);
		expect(after.title).toBe('versión mía');
		expect(after.changeSeq).toBe(before.changeSeq);
		expect(after.cloudSeq).toBe(before.cloudSeq);
		expect(await countConflicts()).toBe(1);
		expect((await listConflicts())[0].remote.title).toBe('versión de allá');
	});

	it('"quedarme con lo mío" también se deshace', async () => {
		const id = await bothEdited();
		const before = await db.table('notes').get(id);
		const [conflict] = await listConflicts();

		const undo = await keepLocal(conflict.id);
		await undoDecision(undo);

		const after = await db.table('notes').get(id);
		expect(after.title).toBe('versión mía');
		// The whole point of `keepLocal` was to move this; undoing has to move it
		// back or the row stays armed to overwrite the other device.
		expect(after.cloudSeq).toBe(before.cloudSeq);
		expect(await countConflicts()).toBe(1);
	});

	it('deshacer sobre una decisión que ya no existe no rompe nada', async () => {
		expect(await undoDecision(null)).toBe(false);
		expect(await undoDecision(undefined)).toBe(false);
	});

	it('a conflict already decided elsewhere is not resurrected', async () => {
		const id = await bothEdited();
		const [conflict] = await listConflicts();
		await keepLocal(conflict.id);

		// Nothing to undo, because nothing happened.
		expect(await takeRemote(conflict.id)).toBe(null);
		expect((await db.table('notes').get(id)).title).toBe('versión mía');
	});
});
