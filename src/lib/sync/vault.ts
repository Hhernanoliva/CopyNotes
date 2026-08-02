// The vault key: the one secret that makes the cloud unable to read a note
// (spec 030 phase 2). It is generated on the device, never leaves it in
// plaintext, and no account password can produce it — resetting the account
// password decrypts nothing.
//
// How it is held:
//
// - The key itself lives in IndexedDB as a **non-extractable** CryptoKey. The
//   browser (and the Tauri webview, which is a browser) will encrypt and
//   decrypt with it but will not hand its bytes to any script, ours included.
//   One mechanism covers desktop and web; spec 030 named the OS keychain for
//   desktop, and this is the same guarantee without a Rust dependency, since
//   the threat model already excludes an attacker sitting at an unlocked,
//   already-authorised machine.
// - A second, wrapped copy exists for *other* devices: the key encrypted with a
//   key derived from the recovery code. That wrapped copy is useless without
//   the code, which is why the server may hold it.
//
// The recovery code is shown once and never stored. If the user loses it and
// every device, the notes are unrecoverable — that is the price of the cloud
// not being able to read them, and it has to be said on screen, not only here.

import { db } from '../storage/db';
import { hasUploadConsent } from './pending';
import { fromBase64, toBase64 } from './base64';
import { now } from '../storage/ids';

const VAULT_ID = 'default';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const CODE_BYTES = 15; // 120 bits → exactly 24 base32 characters
const CODE_LENGTH = 24;
const CODE_GROUP = 4;
// OWASP's floor for PBKDF2-SHA256. The cost is paid once, when a device is
// recovered — never on a note read.
const DERIVE_ROUNDS = 600_000;
// Crockford base32: no I, L, O or U, so a code read out loud or copied by hand
// cannot turn into a different code.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const vault = () => db.table('vault');

function encodeCode(bytes) {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	return out.replace(new RegExp(`.{${CODE_GROUP}}`, 'g'), '$&-').slice(0, -1);
}

// What the user types is forgiving: any spacing, any case, and the characters
// people substitute when copying by hand.
export function normalizeRecoveryCode(code) {
	const cleaned = String(code)
		.toUpperCase()
		.replace(/[\s-]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (cleaned.length !== CODE_LENGTH || [...cleaned].some((char) => !ALPHABET.includes(char))) {
		throw new Error('El código de recuperación no tiene el formato correcto');
	}
	return cleaned;
}

async function wrappingKey(code, salt) {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(normalizeRecoveryCode(code)),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: DERIVE_ROUNDS, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

function importVaultKey(raw) {
	// extractable: false — from here on the bytes are the browser's to hold.
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Browsers evict site data: Safari after roughly a week of disuse on a site
// that is not installed. Losing local notes is what the JSON backup is for, but
// losing the device key would mean recovering with the code, so ask the browser
// to keep this origin. Asked for here, at vault creation, and not at boot: a
// user who never opts into the cloud never sees the prompt Firefox shows.
async function keepStorage() {
	try {
		await globalThis.navigator?.storage?.persist?.();
	} catch {
		// Old browser, or a mode that refuses to answer. Nothing to do about it.
	}
}

export async function hasVault() {
	return Boolean(await vault().get(VAULT_ID));
}

export async function getVaultKey() {
	const row = await vault().get(VAULT_ID);
	return row ? row.key : null;
}

// What a second device needs, together with the recovery code. Safe to upload:
// without the code it is noise.
export async function getRecoveryBlob() {
	const row = await vault().get(VAULT_ID);
	return row ? { salt: row.salt, iv: row.iv, wrapped: row.wrapped } : null;
}

export async function createVault() {
	if (await hasVault()) {
		throw new Error('Ya existe una bóveda en este dispositivo');
	}
	// Creating the key and allowing the upload are one decision, and this is the
	// door that enforces it rather than the screen that asks.
	//
	// Split, the half without the other is worse than useless. `uploadVaultBlob`
	// only sends the wrapped copy once consent exists, so a vault created without
	// it never reaches the server; the second device then asks "does this account
	// have a vault?", is told no, and builds a rival one with a different key.
	// From that moment each device uploads records the other cannot open, and
	// `vaults` holds whichever wrapped key happened to arrive last.
	//
	// Nothing local is waiting on it either: on this device the notes are stored
	// plain (spec 030, decision D1). The vault exists to serve the cloud, so it
	// comes into being when the cloud is allowed and not a moment before.
	if (!(await hasUploadConsent())) {
		throw new Error('Primero hace falta el permiso para subir a la nube');
	}
	const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
	const codeBytes = crypto.getRandomValues(new Uint8Array(CODE_BYTES));
	const recoveryCode = encodeCode(codeBytes);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

	const key = await importVaultKey(raw);
	const wrapped = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		await wrappingKey(recoveryCode, salt),
		raw
	);
	// The only readable copy of the key dies here; the CryptoKey keeps working.
	raw.fill(0);
	codeBytes.fill(0);

	await vault().put({
		id: VAULT_ID,
		key,
		salt: toBase64(salt),
		iv: toBase64(iv),
		wrapped: toBase64(new Uint8Array(wrapped)),
		createdAt: now()
	});
	await keepStorage();
	return { recoveryCode };
}

// Second-device path: the wrapped key comes from the server, the code from the
// user. A wrong code fails here and leaves nothing behind.
export async function restoreVault(code, blob) {
	const salt = fromBase64(blob.salt);
	const raw = new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(blob.iv) },
			await wrappingKey(code, salt),
			fromBase64(blob.wrapped)
		)
	);
	const key = await importVaultKey(raw);
	raw.fill(0);

	await vault().put({
		id: VAULT_ID,
		key,
		salt: blob.salt,
		iv: blob.iv,
		wrapped: blob.wrapped,
		createdAt: now()
	});
	await keepStorage();
	return key;
}
