// Spec 041 §8: el único texto que reemplaza a una imagen donde los píxeles no
// pueden ir — exportar a archivo, el agente, y una imagen degradada por el
// gate de ingesta (format/ingest.ts). Los bytes de una imagen viven en
// `imageBodies`, sin sincronizar, y un `blob:` deja de existir en cuanto
// CopyNotes se cierra — así que ninguno de esos tres destinos puede escribir
// uno. Se avisa en texto que hubo una imagen, y la descripción es lo único de
// la imagen que puede viajar. Sin imports propios a propósito: format/,
// export-import/ y bridge/ lo importan los tres, y ninguno de ellos puede
// importar de los otros dos sin armar un ciclo.
export function imageExportText(block) {
	return block.content ? `[Imagen: ${block.content}]` : '[Imagen]';
}
