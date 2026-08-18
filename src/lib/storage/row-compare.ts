// ¿Estas dos versiones de una fila son la misma para quien la mira?
//
// Nació dentro del editor (`editor/reconcile.ts`), pero la pregunta la hacen dos
// lugares que no se conocen: el editor, para decidir si un cambio de afuera
// invalida el historial de Deshacer, y la bajada de la nube, para decidir si una
// diferencia merece molestar a alguien. La respuesta tiene que ser la misma en
// los dos, así que la definición vive en un solo lado.

// Bookkeeping que se reescribe sola: la nube sella `cloudSeq`, cada guardado
// mueve `updatedAt` y `changeSeq`. Si contara como cambio, cualquier tic de
// sincronización se vería como una edición sin que nada cambie en pantalla.
//
// `serverSeq` es de spec 038 §5: el orden que el servidor le reparte a cada línea
// de bitácora al recibirla. Lo escribe el caño compartido, no la persona.
const BOOKKEEPING = new Set(['updatedAt', 'changeSeq', 'cloudSeq', 'fromCloud', 'serverSeq']);

// Todos los campos de una fila son valores sueltos (texto, número, booleano o
// null), así que comparar uno por uno alcanza.
export function sameToTheUser(before, after) {
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (!BOOKKEEPING.has(key) && before[key] !== after[key]) return false;
	}
	return true;
}
