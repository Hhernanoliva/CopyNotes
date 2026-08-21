// ¿Estas dos versiones de una fila son la misma para quien la mira?
//
// Nació dentro del editor (`editor/reconcile.ts`), pero la pregunta la hacen dos
// lugares que no se conocen: el editor, para decidir si un cambio de afuera
// invalida el historial de Deshacer, y la bajada de la nube, para decidir si una
// diferencia merece molestar a alguien. La respuesta tiene que ser la misma en
// los dos, así que la definición vive en un solo lado.

import { missingShapeFields } from './shape';

// Bookkeeping que se reescribe sola: la nube sella `cloudSeq`, cada guardado
// mueve `updatedAt` y `changeSeq`. Si contara como cambio, cualquier tic de
// sincronización se vería como una edición sin que nada cambie en pantalla.
//
// `serverSeq` es de spec 038 §5: el orden que el servidor le reparte a cada línea
// de bitácora al recibirla. Lo escribe el caño compartido, no la persona.
const BOOKKEEPING = new Set(['updatedAt', 'changeSeq', 'cloudSeq', 'fromCloud', 'serverSeq']);

// Un campo ausente de un lado contra su valor de NACIMIENTO del otro no es un
// desacuerdo — misma regla que `identical()` en `export-import/merge.ts` (spec
// 040/041), leída de la misma fuente (`missingShapeFields`) para no llevar una
// segunda lista de valores de nacimiento. Sin esto, una fila bajada de la nube
// con un aparato viejo (que todavía no tiene un campo nuevo, como los cinco de
// imagen de spec 041) se ve "distinta" de la fila local que sí lo tiene en su
// valor por defecto, y molesta a la persona con un conflicto que no existe.
//
// El centinela es necesario porque `missingShapeFields` completa las fechas con
// lo que se le pase, y una fecha ausente no tiene valor de nacimiento para
// inventar.
const NO_DEFAULT = ' sin-valor-de-nacimiento';

function forgivesAbsence(table, field, one, other) {
	if (one !== undefined && other !== undefined) return false;
	const defaults = missingShapeFields(table, {}, NO_DEFAULT);
	if (!(field in defaults) || defaults[field] === NO_DEFAULT) return false;
	const present = one === undefined ? other : one;
	return present === defaults[field];
}

// Todos los campos de una fila son valores sueltos (texto, número, booleano o
// null), así que comparar uno por uno alcanza.
export function sameToTheUser(table, before, after) {
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (BOOKKEEPING.has(key)) continue;
		if (before[key] === after[key]) continue;
		if (forgivesAbsence(table, key, before[key], after[key])) continue;
		return false;
	}
	return true;
}
