// La mitad de la nube de "Reemplazar todo" (spec 039).
//
// Restaurar reescribe cada fila como una edición local nueva, y hace bien: un
// archivo no puede afirmar nada sobre un servidor (spec 018). El precio es que
// para la nube eso es indistinguible de "editó 1500 filas sin conexión", así que
// `push_records` rechaza cada una y `decide()` estaciona un conflicto por fila.
// Las dos guardas están bien y cada una cerró una pérdida de datos real. Lo que
// faltaba era que restaurar signifique algo: es la única operación donde la
// persona YA contestó la pregunta que el conflicto está por hacerle.
//
// Por eso acá no se toca nada de la sincronización. Se vacía la copia de la nube
// y se sube por el camino de siempre.

import { ready, syncNow } from './upload';

// ¿Restaurar en este aparato va a reemplazar también la copia de la nube? Lo
// pregunta el cartel de confirmación, que tiene que decir la verdad y nada más:
// sin nube, sin sesión, sin permiso de subir o sin bóveda, restaurar es un asunto
// de este aparato solo.
export async function restoreReachesCloud() {
	return (await ready()) !== null;
}

// Corre DESPUÉS de que el restore local ya commiteó, y nunca adentro de su
// transacción: una llamada de red adentro de una transacción de Dexie la cierra
// antes de tiempo.
//
// El orden —vaciar y después subir— es el único recuperable. Si falla acá, el
// aparato quedó restaurado y la nube vieja, y volver a restaurar el archivo lo
// arregla. Al revés, un corte deja la cuenta vacía y el aparato sin nada.
//
// `syncNow` es a propósito, y no un subidor propio: es el que consulta
// `list_shares()` ANTES de subir (spec 038), así una nota compartida no se va por
// el caño cifrado. La marca `share` no viaja en el respaldo, así que después de
// restaurar este aparato no sabe qué notas están compartidas hasta esa consulta.
export async function claimAccountAfterRestore() {
	const gate = await ready();
	if (!gate) return false;
	const { error } = await gate.client.rpc('reset_records');
	if (error) throw new Error(error.message);
	await syncNow();
	return true;
}
