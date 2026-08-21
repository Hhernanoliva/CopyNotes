// Un bloque de imagen y sus bytes son una sola cosa: entran los dos o no entra
// ninguno (spec 041 §4.2). Toda la preparación que puede fallar —firma, tope,
// medidas, huella— ocurre ANTES, así que la transacción sólo escribe.
import { createBlock } from '../storage/blocks';
import { getNote } from '../storage/notes';
import { putBody } from './bodies';
import { prepareImage } from './ingest';

export async function insertImageBlock({
	noteId,
	parentBlockId = null,
	order = undefined,
	file,
	measure,
	saveBody = putBody
}) {
	// Spec 041 §8, criterio 16: comprobado ACÁ, en el almacenamiento, no sólo en
	// la pantalla — una nota compartida no toma una imagen porque sus bytes no
	// pueden viajar por el caño compartido (spec/sync/shared-payload.ts). ANTES
	// de tocar el archivo: procesar bytes que de entrada no van a entrar es
	// trabajo tirado.
	const note = await getNote(noteId);
	if (note?.share) return { status: 'shared', block: null };

	const prepared = await prepareImage(file, measure);
	if (prepared.status !== 'ready') return { ...prepared, block: null };

	// Los bytes primero. Un cuerpo huérfano se puede limpiar; un bloque que
	// apunta a bytes que no existen es una imagen rota en pantalla.
	try {
		await saveBody({
			imageId: prepared.imageId,
			blob: prepared.blob,
			type: prepared.type,
			bytes: prepared.bytes,
			width: prepared.width,
			height: prepared.height
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { status: 'failed', block: null, reason };
	}

	try {
		const block = await createBlock({
			noteId,
			parentBlockId,
			order,
			type: 'image',
			content: '',
			imageId: prepared.imageId,
			imageType: prepared.type,
			imageBytes: prepared.bytes,
			imageWidth: prepared.width,
			imageHeight: prepared.height
		});
		return { status: 'ready', block };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { status: 'failed', block: null, reason };
	}
}
