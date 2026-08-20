// Spec 041 §8: el único texto que reemplaza a una imagen donde los píxeles no
// pueden ir — exportar a archivo, el agente, y una imagen degradada por el
// gate de ingesta (format/ingest.ts). Sin imports propios a propósito: format/,
// export-import/ y bridge/ lo importan los tres, y ninguno de ellos puede
// importar de los otros dos sin armar un ciclo.
export function imageExportText(block) {
	return block.content ? `[Imagen: ${block.content}]` : '[Imagen]';
}
