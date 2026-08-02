import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { dumpAllTables } from '../storage/backup';
import { createNote } from '../storage/notes';
import { encryptRecord, decryptRecord } from './records';
import {
	createVault,
	getRecoveryBlob,
	getVaultKey,
	hasVault,
	normalizeRecoveryCode,
	restoreVault
} from './vault';
import { grantUploadConsent } from './pending';
import { setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	// A vault may not be created before the upload is consented to — see the test
	// at the bottom of this block for why. Every test below is about what the
	// vault does once it legitimately exists.
	await grantUploadConsent();
});

const CROCKFORD = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}(-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}$/;

describe('the vault key', () => {
	it('starts absent and appears once created', async () => {
		expect(await hasVault()).toBe(false);
		expect(await getVaultKey()).toBe(null);

		await createVault();

		expect(await hasVault()).toBe(true);
		expect(await getVaultKey()).not.toBe(null);
	});

	it('hands out a recovery code the user can read out loud', async () => {
		const { recoveryCode } = await createVault();

		// Six groups of four, no letters that look like digits (Crockford base32).
		expect(recoveryCode).toMatch(CROCKFORD);
	});

	it('encrypts a record that only this vault can read back', async () => {
		await createVault();
		const key = await getVaultKey();

		const payload = await encryptRecord(key, 'notes', {
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});

		expect(JSON.stringify(payload)).not.toContain('banco');
		expect(await decryptRecord(key, payload)).toEqual({
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});
	});

	it('refuses to exist before the upload is consented to', async () => {
		// The two are one decision, because half of it is useless and harmful. The
		// wrapped copy of the key only travels behind the consent gate, so a vault
		// created without it never reaches the server — and the second device, told
		// this account has no vault, builds a rival one with a different key. From
		// then on each device uploads records the other cannot open.
		//
		// Nothing local needs the vault either: on this machine the notes are plain
		// (decision D1). A vault exists to serve the cloud, so it exists only once
		// the cloud is allowed.
		await setSetting(KEY.syncConsent, false);

		await expect(createVault()).rejects.toThrow(/permiso/i);
		expect(await hasVault()).toBe(false);
	});

	it('refuses to create a second vault over the first', async () => {
		await createVault();

		await expect(createVault()).rejects.toThrow();
	});

	it('never stores the recovery code, and the key cannot be read out', async () => {
		const { recoveryCode } = await createVault();
		const row = await db.table('vault').get('default');

		expect(JSON.stringify(row)).not.toContain(recoveryCode.replace(/-/g, ''));
		expect(JSON.stringify(row)).not.toContain(recoveryCode);
		// A non-extractable key: not even our own code can export the bytes.
		expect(row.key.extractable).toBe(false);
		await expect(crypto.subtle.exportKey('raw', row.key)).rejects.toThrow();
	});

	it('stays out of the JSON backup, which is plain text', async () => {
		await createVault();
		await createNote({ title: 'una nota' });

		const dump = await dumpAllTables();

		expect(dump.vault).toBe(undefined);
	});
});

describe('recovering the vault on a second device', () => {
	it('unwraps the same key from the recovery code', async () => {
		const { recoveryCode } = await createVault();
		const first = await getVaultKey();
		const blob = await getRecoveryBlob();
		const payload = await encryptRecord(first, 'notes', {
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});

		// A second device: empty database, plus what the server would hold.
		await db.table('vault').clear();
		expect(await hasVault()).toBe(false);

		const recovered = await restoreVault(recoveryCode, blob);

		expect(await decryptRecord(recovered, payload)).toEqual({
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		expect(await hasVault()).toBe(true);
	});

	it('rejects a wrong code and stores nothing', async () => {
		await createVault();
		const blob = await getRecoveryBlob();
		await db.table('vault').clear();

		await expect(restoreVault('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ', blob)).rejects.toThrow();
		expect(await hasVault()).toBe(false);
	});

	it('forgives how the user typed the code', async () => {
		const { recoveryCode } = await createVault();
		const blob = await getRecoveryBlob();
		await db.table('vault').clear();

		const sloppy = recoveryCode.toLowerCase().replace(/-/g, ' ');

		expect(await restoreVault(sloppy, blob)).not.toBe(null);
	});

	it('reads o/O as zero and i/l as one, the way people copy codes', () => {
		expect(normalizeRecoveryCode('o0Il-1lo0-  abcd-EFGH-JKMN-PQRS')).toBe(
			'00111100ABCDEFGHJKMNPQRS'
		);
	});

	it('refuses a code of the wrong length or with letters it never uses', () => {
		expect(() => normalizeRecoveryCode('ABCD-EFGH')).toThrow();
		expect(() => normalizeRecoveryCode('UUUU-UUUU-UUUU-UUUU-UUUU-UUUU')).toThrow();
	});
});
