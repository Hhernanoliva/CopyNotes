// La única puerta a `imageBodies` (spec 041 §4.2). Los bytes viven acá y en
// ningún otro lado: ni en la fila del bloque, ni en `block.html`, ni en una
// fotografía de Deshacer.
import { db } from '../storage/db';
import { now } from '../storage/ids';
import { trackPendingWrite } from '../storage/pending-writes';

const bodies = () => db.table('imageBodies');

export function putBody({ imageId, blob, type, bytes, width, height }) {
	return trackPendingWrite(async () => {
		// `put` y no `add`: la huella ES el contenido, así que volver a guardar la
		// misma imagen escribe exactamente los mismos bytes. No es un conflicto.
		await bodies().put({
			imageId,
			blob,
			type,
			bytes,
			width,
			height,
			createdAt: now(),
			uploadedFor: null
		});
		return imageId;
	});
}

export function getBody(imageId) {
	return bodies().get(imageId);
}

// Contesta sin traer el Blob a memoria: una nota con veinte capturas preguntaría
// veinte veces, y cada respuesta pesaría cientos de KB.
export async function hasBody(imageId) {
	return (await bodies().where('imageId').equals(imageId).count()) > 0;
}

export function listBodyIds() {
	return bodies().toCollection().primaryKeys();
}

export function deleteBody(imageId) {
	return trackPendingWrite(() => bodies().delete(imageId));
}

export function clearBodies() {
	return trackPendingWrite(() => bodies().clear());
}

export function markBodyUploaded(imageId, accountId) {
	return trackPendingWrite(() => bodies().update(imageId, { uploadedFor: accountId }));
}

// La llama `resetCloudState()` (spec 041 §4.3): sin esto, "Empezar de nuevo la
// nube" cree que la cuenta nueva ya tiene bytes que nunca vio.
export function clearUploadMarks() {
	return trackPendingWrite(() => bodies().toCollection().modify({ uploadedFor: null }));
}
