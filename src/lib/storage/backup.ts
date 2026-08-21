// Storage side of export/import (specs/007 + 018). The full dump includes
// soft-deleted rows on purpose: the JSON backup is the safety net, and a
// restore should bring back exactly what was there. Both write paths run in
// one transaction so a failure leaves the database untouched.

import { db } from './db';
import { settlePendingWrites, trackPendingWrite } from './pending-writes';
import { normalizeSidebarOrder } from './organize';
import { BACKUP_TABLES, LOCAL_ONLY_FIELDS } from '../export-import/schema';
import { referencedImageIds } from '../export-import/package';
import { imageBodyRow } from '../images/bodies';
import { isBackupSafe } from './settings-registry';

// Spec 041 §5.1: el formato lo decide el contenido del respaldo, no una
// preferencia ni una casilla. Sin un solo `imageId` referenciado —papelera
// incluida, porque un bloque borrado sigue apuntando a su imagen— el archivo
// es exactamente el `.json` de siempre, que cualquier CopyNotes anterior sigue
// importando.
//
// Devuelve la terminación y nada más. El número de versión NO se decide acá:
// lo estampa quien arma el archivo —`buildBackup` el 5, `buildPackage` el 6—
// justamente para que no dependa de que alguien se acuerde de pasarlo.
export function chooseBackupFormat(blocks) {
	return referencedImageIds(blocks).size === 0 ? 'json' : 'copynotes';
}

// The change counter (spec 030 phase 1) is per-device bookkeeping and never
// leaves through here: a row is re-stamped when it is written, so a counter
// inside a backup file could never match the restored row again — and the merge
// compares whole records, so it would read every row as a conflict and
// duplicate the whole database on a second import of the same file. This dump
// feeds both sides of that comparison (the file and the local rows), so
// dropping it here keeps them comparable. Later sync-only fields (`ownerId`)
// belong on this same list.
//
// `cloudSeq` (spec 030 phase 3) joins it for the same reason and one more: it
// says "the server already has this exact version". Restored onto another
// device, or after the row was edited, that claim is false — and a false claim
// there means a change that never uploads.
//
// The list itself lives in `export-import/schema.ts` (imported above), which is
// the gate that strips the same fields on the way back IN. Two copies would
// drift, and a field stripped on export but trusted on import is a hole — that
// is exactly what `fromCloud` was.

function withoutLocalOnlyFields(rows) {
	return rows.map((row) => {
		const copy = { ...row };
		for (const field of LOCAL_ONLY_FIELDS) delete copy[field];
		return copy;
	});
}

export async function dumpAllTables() {
	await settlePendingWrites();
	return db.transaction('r', BACKUP_TABLES, async () => {
		const entries = await Promise.all(
			BACKUP_TABLES.map(async (name) => [name, withoutLocalOnlyFields(await db.table(name).toArray())])
		);
		return Object.fromEntries(entries);
	});
}

export async function applyMergePlan(plan) {
	await settlePendingWrites();
	return trackPendingWrite(() =>
		db.transaction('rw', BACKUP_TABLES, async () => {
			for (const name of BACKUP_TABLES) {
				if (name === 'settings') continue;
				const rows = plan.inserts[name] ?? [];
				if (rows.length > 0) await db.table(name).bulkAdd(rows);
			}
			for (const setting of plan.settings) {
				await db.table('settings').put(setting);
			}
			await normalizeSidebarOrder();
		})
	);
}

// Caller must validate the incoming backup BEFORE calling this: once the
// transaction commits, the previous data is gone.
//
// "Todo" son los datos, no el aparato. Dos cosas se salvan del borrado:
//
//   - Las preferencias que NO viajan en un respaldo (la pausa de los agentes,
//     el permiso de subir a la nube, los cursores de sincronización). Son
//     decisiones de ESTE aparato, y borrarlas las devolvía a su valor por
//     defecto: restaurar un archivo despausaba a los agentes sin que nadie los
//     despausara. La pausa tiene que fallar cerrada.
//   - Nada más: los conflictos de la nube sí se tiran, porque describen dos
//     versiones de un renglón que después de esto puede no existir.
//
// `bodies` son las capturas que trae un paquete `.copynotes` (spec 041 §5.5),
// ya validadas por `readPackage`. Van adentro de esta misma transacción y ANTES
// de las filas, por dos motivos: `imageBodies` NO está en `BACKUP_TABLES` a
// propósito —sus filas no son JSON—, así que el borrado de abajo no la toca y
// los cuerpos de la base anterior sobrevivirían al reemplazo; y un corte que
// dejara los bloques escritos sin sus bytes es una imagen rota en pantalla,
// mientras que un cuerpo huérfano no se ve y se recupera.
export async function replaceAllTables(data, bodies = []) {
	await settlePendingWrites();
	const deviceOnly = (await db.table('settings').toArray()).filter(
		(row) => !isBackupSafe(row.key)
	);
	return trackPendingWrite(() =>
		db.transaction('rw', [...BACKUP_TABLES, 'conflicts', 'imageBodies'], async () => {
			await db.table('imageBodies').clear();
			if (bodies.length > 0) await db.table('imageBodies').bulkPut(bodies.map(imageBodyRow));
			for (const name of BACKUP_TABLES) {
				await db.table(name).clear();
				const rows = data[name] ?? [];
				if (rows.length > 0) await db.table(name).bulkPut(rows);
			}
			// Después del `bulkPut`: si el archivo trae una de estas claves, la del
			// aparato es la que vale.
			if (deviceOnly.length > 0) await db.table('settings').bulkPut(deviceOnly);
			await db.table('conflicts').clear();
			await normalizeSidebarOrder();
		})
	);
}
