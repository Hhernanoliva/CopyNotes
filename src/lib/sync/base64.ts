// Bytes ↔ base64, shared by the vault and the record blobs: both have to put
// raw bytes inside JSON on their way to a server. Chunked because
// String.fromCharCode(...bytes) blows the argument limit on a big snippet tree.

export function toBase64(bytes) {
	let text = '';
	for (let index = 0; index < bytes.length; index += 8192) {
		text += String.fromCharCode(...bytes.subarray(index, index + 8192));
	}
	return btoa(text);
}

export function fromBase64(text) {
	const raw = atob(text);
	const bytes = new Uint8Array(raw.length);
	for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
	return bytes;
}
