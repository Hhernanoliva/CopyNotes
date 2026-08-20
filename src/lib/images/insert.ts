// Un bloque de imagen y sus bytes son una sola cosa: entran los dos o no entra
// ninguno (spec 041 §4.2). Toda la preparación que puede fallar —firma, tope,
// medidas, huella— ocurre ANTES, así que la transacción sólo escribe.
import { createBlock } from '../storage/blocks';
import { putBody } from './bodies';
import { prepareImage } from './ingest';

export async function insertImageBlock({
	noteId,
	parentBlockId = null,
	order,
	file,
	measure,
	saveBody = putBody
}) {
	const prepared = await prepareImage(file, measure);
	if (prepared.status !== 'ready') return prepared;

	// Los bytes primero. Un cuerpo huérfano se puede limpiar; un bloque que
	// apunta a bytes que no existen es una imagen rota en pantalla.
	try {
		await saveBody(prepared);
	} catch (error) {
		return { status: 'failed', reason: String(error?.message ?? error) };
	}

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
}
