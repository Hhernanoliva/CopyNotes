// The vault key: the one secret that makes the cloud unable to read a note
// (spec 030 phase 2). It is generated on the device and no account password can
// produce it — resetting the account password decrypts nothing.
//
// How it is held, and how it travels (spec 035):
//
// - The key lives in IndexedDB as a CryptoKey. It is **wrappable**, which is
//   the one thing this file gives up on purpose: `importVaultKey` says what that
//   costs and why the alternative was worse.
// - It reaches a second device by being **wrapped for that trip and no other**,
//   under a key derived from eight characters the old device shows on screen for
//   ten minutes. Nothing is stored: not the code, not an unwrapped copy. The
//   server holds the wrapped blob only while the trip lasts (`sync/pairing.ts`).
// - What stays on the server long-term is a **proof**, not a copy: a known text
//   encrypted with the key. It opens nothing; it answers exactly one question,
//   the one in `uploadVaultBlob`.
//
// There is no recovery code any more, and nothing for the user to keep. Losing
// every device with the key means the cloud copy is unreadable — that is the
// price of the cloud not being able to read it, and it is said on screen, in
// "Empezar de nuevo la nube", not only here.

import { db } from '../storage/db';
import { hasUploadConsent } from './pending';
import { fromBase64, toBase64 } from './base64';
import { now } from '../storage/ids';

const VAULT_ID = 'default';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const PAIR_BYTES = 5; // 40 bits → exactamente 8 caracteres base32
const PAIR_LENGTH = 8;
const PAIR_GROUP = 4;
const PAIRING_MINUTES = 10;
// OWASP's floor for PBKDF2-SHA256. The cost is paid once, when a device is
// added — never on a note read, and never on a guess that matters less.
const DERIVE_ROUNDS = 600_000;
// Crockford base32: no I, L, O or U, so a code read out loud or copied by hand
// cannot turn into a different code.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// El texto que se cifra con la llave y queda en el servidor como prueba. No es
// secreto: lo que prueba es quién puede abrirlo.
const PROOF_TEXT = 'copynotes';

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
	return out.replace(new RegExp(`.{${PAIR_GROUP}}`, 'g'), '$&-').slice(0, -1);
}

// What the user types is forgiving: any spacing, any case, and the characters
// people substitute when copying by hand.
export function normalizePairingCode(code) {
	const cleaned = String(code)
		.toUpperCase()
		.replace(/[\s-]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (cleaned.length !== PAIR_LENGTH || [...cleaned].some((char) => !ALPHABET.includes(char))) {
		throw new Error('El código no tiene el formato correcto');
	}
	return cleaned;
}

// La llave que envuelve a la llave. `wrapKey`/`unwrapKey` y nada más: con esos
// permisos no puede cifrar una nota ni por accidente.
async function wrappingKey(code, salt) {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(normalizePairingCode(code)),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: DERIVE_ROUNDS, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['wrapKey', 'unwrapKey']
	);
}

// `extractable: true`, y es la única defensa que la spec 035 entrega a cambio.
//
// Antes era `false`: el navegador no soltaba los bytes ni a nuestro propio
// código. Eso también hacía imposible pasarle la llave a otro aparato de la
// misma persona, y de ahí salía el código de 24 caracteres que había que
// guardar durante meses y que nadie guardaba — cuando llegaba el segundo
// aparato, no estaba, y con él se perdía la copia de la nube.
//
// Lo que NO cambia: los bytes en claro no pasan por acá. `wrapKey` exporta y
// cifra adentro del navegador, así que ninguna variable de JavaScript los ve.
// Lo que sí cambia: un script hostil que llegara a correr adentro de la app
// podría exportarla. Lo que impide que eso pase sigue siendo la CSP y el
// saneador de HTML, que ahora sostienen una cosa más.
function importVaultKey(raw) {
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// Browsers evict site data: Safari after roughly a week of disuse on a site
// that is not installed. Losing local notes is what the JSON backup is for, but
// losing the device key would mean asking another device for a code, so ask the
// browser to keep this origin. Asked for here, at vault creation, and not at
// boot: a user who never opts into the cloud never sees the prompt Firefox shows.
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

export async function createVault() {
	if (await hasVault()) {
		throw new Error('Ya existe una bóveda en este dispositivo');
	}
	// Creating the key and allowing the upload are one decision, and this is the
	// door that enforces it rather than the screen that asks.
	//
	// Split, the half without the other is worse than useless. The vault row only
	// reaches the server once consent exists, so a vault created without it never
	// gets there; the second device then asks "does this account have a vault?",
	// is told no, and builds a rival one with a different key. From that moment
	// each device uploads records the other cannot open.
	//
	// Nothing local is waiting on it either: on this device the notes are stored
	// plain (spec 030, decision D1). The vault exists to serve the cloud, so it
	// comes into being when the cloud is allowed and not a moment before.
	if (!(await hasUploadConsent())) {
		throw new Error('Primero hace falta el permiso para subir a la nube');
	}
	const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
	const key = await importVaultKey(raw);
	// The only readable copy of the key dies here; the CryptoKey keeps working.
	raw.fill(0);

	await vault().put({ id: VAULT_ID, key, createdAt: now() });
	await keepStorage();
}

// La prueba que va al servidor: un texto conocido cifrado con esta llave.
//
// Sirve para una sola pregunta, y es una que sin ella no tiene respuesta: cuando
// el servidor contesta "esta cuenta ya tiene bóveda", ¿es la mía, de la corrida
// anterior, o la de otro aparato que llegó primero? Ver `uploadVaultBlob`.
export async function makeVaultProof() {
	const key = await getVaultKey();
	if (!key) throw new Error('Este dispositivo todavía no tiene la bóveda');
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(PROOF_TEXT)
	);
	return { iv: toBase64(iv), check_blob: toBase64(new Uint8Array(sealed)) };
}

export async function proofOpens(proof) {
	const key = await getVaultKey();
	if (!key || !proof?.iv || !proof?.check_blob) return false;
	try {
		const opened = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(proof.iv) },
			key,
			fromBase64(proof.check_blob)
		);
		return new TextDecoder().decode(opened) === PROOF_TEXT;
	} catch {
		// Otra llave. No es un error: es la respuesta.
		return false;
	}
}

// Lo que el aparato viejo le muestra al nuevo. El código se sortea acá y no se
// guarda en ningún lado: vive en la pantalla diez minutos y se acabó.
export async function makePairingBlob() {
	const row = await vault().get(VAULT_ID);
	if (!row) throw new Error('Este dispositivo todavía no tiene la bóveda');
	const codeBytes = crypto.getRandomValues(new Uint8Array(PAIR_BYTES));
	const code = encodeCode(codeBytes);
	codeBytes.fill(0);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const wrapped = await crypto.subtle.wrapKey('raw', row.key, await wrappingKey(code, salt), {
		name: 'AES-GCM',
		iv
	});
	return {
		code,
		expiresAt: new Date(Date.now() + PAIRING_MINUTES * 60_000).toISOString(),
		blob: {
			salt: toBase64(salt),
			iv: toBase64(iv),
			wrapped: toBase64(new Uint8Array(wrapped))
		}
	};
}

// El otro lado del viaje. Un código equivocado falla acá, en la comprobación del
// propio navegador —AES-GCM abre o no abre, no hay "casi"— y no deja nada.
//
// Llega `extractable: true` a propósito: el aparato que se acaba de sumar tiene
// que poder sumar a un tercero, o sería una vía muerta que nadie descubre hasta
// el día que hace falta.
export async function openPairingBlob(code, blob) {
	const key = await crypto.subtle.unwrapKey(
		'raw',
		fromBase64(blob.wrapped),
		await wrappingKey(code, fromBase64(blob.salt)),
		{ name: 'AES-GCM', iv: fromBase64(blob.iv) },
		{ name: 'AES-GCM' },
		true,
		['encrypt', 'decrypt']
	);
	await vault().put({ id: VAULT_ID, key, createdAt: now() });
	await keepStorage();
	return key;
}
