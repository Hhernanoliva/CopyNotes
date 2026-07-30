// Encryption at the upload edge (spec 030 phase 2). A record becomes one
// unreadable blob on its way OUT of the device; local rows stay plaintext, so
// nothing about the app's speed, indexes or unload journal changes (decision D1
// in spec 030).
//
// What stays readable is only what a server needs to file the row: its id (a
// random UUID that carries no meaning), which table it belongs to, the change
// counter as the version marker, and whether it is a tombstone. Content, title,
// relations, dates, checkboxes and the private comment all live inside the blob.
//
// The record's identity is bound into the encryption (AES-GCM's additional
// data), so a blob cannot be silently moved to another row or another table by
// whoever holds the database — it simply fails to decrypt.

import { fromBase64, toBase64 } from './base64';

const IV_BYTES = 12;

function identity(table, id) {
	return new TextEncoder().encode(`${table}:${id}`);
}

export async function encryptRecord(key, table, row) {
	// The change counter travels in the clear as the version marker, so it does
	// not need a second copy inside the blob. `cloudSeq` is this device's note to
	// self about which version the server already has (see `putFromCloud`); it
	// means nothing anywhere else and never leaves.
	const { changeSeq, cloudSeq, ...content } = row;
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const blob = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: identity(table, row.id) },
		key,
		new TextEncoder().encode(JSON.stringify(content))
	);
	return {
		id: row.id,
		table,
		changeSeq,
		deleted: Boolean(row.deletedAt),
		iv: toBase64(iv),
		blob: toBase64(new Uint8Array(blob))
	};
}

// Throws if the blob was tampered with, was encrypted for another record, or
// belongs to another vault. There is no "best effort" here: a record that does
// not decrypt is not this user's record.
export async function decryptRecord(key, payload) {
	const plain = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: fromBase64(payload.iv),
			additionalData: identity(payload.table, payload.id)
		},
		key,
		fromBase64(payload.blob)
	);
	return JSON.parse(new TextDecoder().decode(plain));
}
