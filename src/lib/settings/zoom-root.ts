// Dónde quedó parada esta persona dentro de cada nota, en ESTE aparato
// (spec 043). Puro y sin DOM ni storage, igual que sidebar-width.ts.
//
// No es un dato de la nota: por eso `backupSafe: false` en el registro, y por
// eso restaurar un respaldo no mueve a nadie de lugar.

// Sin poda, la clave crece para siempre con cada nota que alguna vez se abrió.
export const MAX_NOTES = 50;

// Guardar reescribe la clave: se borra primero para que vuelva a entrar ÚLTIMA.
// El orden de inserción de las claves de texto es el orden real de un objeto en
// JS, y es lo único que hay para saber cuál es la más vieja — sin sello de
// tiempo y sin una segunda lista que mantener en sincronía.
//
// ponytail: si alguna vez hiciera falta ordenar por "última vez que se miró" y
// no por "última vez que se cambió", ahí sí entra un `{ blockId, at }` por nota.
export function rememberZoomRoot(map, noteId, blockId) {
	const next = { ...(map ?? {}) };
	delete next[noteId];
	if (blockId) next[noteId] = blockId;
	const keys = Object.keys(next);
	for (const old of keys.slice(0, Math.max(0, keys.length - MAX_NOTES))) delete next[old];
	return next;
}
