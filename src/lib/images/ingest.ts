// Todo lo que puede decir que no, antes de que se abra una transacción
// (spec 041 §3.3). Nada de acá convierte, achica ni recodifica: medido, volver a
// apretar ahorra 8-10%, y pedirle WebP a Safari devuelve PNG SIN AVISAR.

// Cinco megas. Va sobre el peso y NUNCA sobre los píxeles: el peso no sigue al
// tamaño —4 megapíxeles pesan 325 KB y 0,3 megapíxeles pesan 345 KB (spec §2)—,
// así que un tope por píxeles le borronea el texto a la grande y deja pasar la
// que de verdad pesa.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const starts = (head, bytes) => bytes.every((byte, index) => head[index] === byte);

// La firma real del archivo. `file.type` y el nombre los escribe quien manda el
// archivo; estos bytes los escribe el codificador.
export function detectImageType(head) {
	if (starts(head, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
	if (starts(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (starts(head, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
	// WebP es un contenedor RIFF: "RIFF" ···· "WEBP".
	if (starts(head, [0x52, 0x49, 0x46, 0x46]) && starts(head.subarray(8), [0x57, 0x45, 0x42, 0x50]))
		return 'image/webp';
	return null;
}

export async function sha256Hex(buffer) {
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// La única parte que necesita un navegador de verdad, y por eso entra inyectada:
// jsdom y node no tienen `createImageBitmap`.
export async function measureImage(blob) {
	try {
		const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		const size = { width: bitmap.width, height: bitmap.height };
		bitmap.close?.();
		return size;
	} catch {
		return null;
	}
}

export async function prepareImage(file, measure = measureImage) {
	// Antes de leer nada: `size` es metadato que el navegador ya tiene, así que
	// un archivo enorme nunca entra en memoria para descubrir que era enorme.
	if (file.size > MAX_IMAGE_BYTES) return { status: 'too-large', bytes: file.size };
	const buffer = await file.arrayBuffer();
	const type = detectImageType(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)));
	if (!type) return { status: 'not-an-image' };
	const size = await measure(file);
	if (!size) return { status: 'undecodable' };
	return {
		status: 'ready',
		imageId: await sha256Hex(buffer),
		type,
		bytes: file.size,
		width: size.width,
		height: size.height,
		blob: file
	};
}
