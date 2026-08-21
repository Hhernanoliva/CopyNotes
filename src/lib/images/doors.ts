// Lo que comparten las tres puertas por donde entra una captura —pegar,
// arrastrar y `/imagen` (spec 041 §3.4)—. Una sola función decide qué es una
// imagen, un solo lugar dice qué se le avisa a la persona cuando no entra.

// Un archivo DE VERDAD gana. Una dirección `<img src="https://...">` copiada de
// una página no es un archivo y NO se descarga: sólo entra lo que el
// portapapeles —o el arrastre— entrega como archivo.
//
// Medido en Safari 26.5: una captura llega como `image.png`, `image/png`. Y un
// pegado puede venir sin nada —ni archivos ni tipos—: ahí esto devuelve una
// lista vacía y quien llama sigue por el camino de texto de siempre.
export function imageFilesFrom(transfer) {
	return [...(transfer?.files ?? [])].filter((file) => file.type?.startsWith('image/'));
}

// Cada final de `insertImageBlock` que no sea 'ready', dicho en castellano. Si
// mañana aparece un estado nuevo sin su renglón acá, el aviso en pantalla diría
// "undefined" — por eso la lista se prueba entera.
export const IMAGE_INSERT_MESSAGES = {
	'too-large': 'Esa imagen pesa más de 5 MB. Probá con una captura más chica.',
	'not-an-image': 'Ese archivo no es una imagen que CopyNotes pueda guardar.',
	undecodable: 'No se pudo leer esa imagen.',
	failed: 'No se pudo guardar la imagen. Puede que no haya espacio.',
	// Spec 041 §8: una nota compartida no toma una imagen — sus bytes no viajan
	// por el caño compartido. `insertImageBlock` ya lo comprueba en el
	// almacenamiento; esto es lo que ese rechazo dice en pantalla.
	shared: 'Una nota compartida todavía no puede tener imágenes.'
};

let persistAsked = false;

// El aparato guarda con un cupo y nadie promete cuánto.
//
// `persist()` pide que lo guardado no se borre solo cuando falte lugar. Es un
// pedido, no una reserva: el navegador contesta lo que quiere y la respuesta no
// cambia nada de lo que hacemos. Se pregunta una vez por sesión.
//
// La estimación es ORIENTACIÓN, NO PERMISO: nunca cancela una inserción. La
// respuesta definitiva la da el aparato con un `QuotaExceededError`, que
// `insertImageBlock` ya devuelve como `status: 'failed'`. Esto sólo dice si
// conviene avisar ANTES de intentar; después se intenta igual.
//
// Todo optativo porque ninguna de las dos existe en todos lados.
// Y todo adentro de un `try`: los dos `?.` cubren que las funciones NO EXISTAN,
// pero las dos pueden además FALLAR —origen opaco, modo privado, y cada motor a
// su manera—. Sin esto, ese rechazo salía por arriba, tumbaba la inserción
// entera y la captura desaparecía sin renglón, sin aviso y sin error: la peor
// forma de fallar, y encima por una estimación que no manda nada.
export async function roomIsTight(file) {
	try {
		if (!persistAsked) {
			persistAsked = true;
			await globalThis.navigator?.storage?.persist?.();
		}
		const room = await globalThis.navigator?.storage?.estimate?.();
		if (room?.quota == null || room?.usage == null) return false;
		return room.quota - room.usage < file.size * 2;
	} catch {
		return false;
	}
}
