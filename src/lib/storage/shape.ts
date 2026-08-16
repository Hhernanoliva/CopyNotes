// Qué campos exige la forma local de una fila, y con qué valor se llenan cuando
// faltan.
//
// Existe porque hay DOS caminos que pueden escribir una fila sin pasar por
// `createNote` / `createBlock` / `appendActivity`, que son los únicos lugares que
// inventan estos campos:
//
//   * `sync/shared-merge.ts`, cuando una fila llega por el caño compartido a un
//     aparato que no la tenía (spec 038). La carga es una lista blanca, así que
//     todo lo privado —`collapsed`, `note`, `createdBy`— queda afuera por diseño;
//     y una LÁPIDA viaja con tres campos, así que llega más pelada todavía.
//   * la migración v12 de `db.ts`, que repara las filas que ya se escribieron
//     así antes de que esto existiera.
//
// Y la razón por la que importa es que una fila incompleta no se nota hasta el
// peor momento: el RESPALDO que ese aparato exporta deja de pasar su propia
// validación —"data.blocks.718.collapsed: Expected collapsed but received
// undefined"— y el archivo entero se vuelve inimportable por un renglón.
// Encontrado en el gate manual del 2026-08-15 con el archivo real de Hernán.
//
// Una copia de esta lista en cada lado se separaría, y el que se olvide es el que
// escribe la fila rota.

// `deletedAt` está en las tres por el mismo motivo que `collapsed`, un campo más
// allá: el validador del respaldo lo exige, y `toSharedPayload` se saltea
// cualquier campo que valga `undefined`, así que una fila viva a la que nunca se le
// escribió la marca llega sin ella. Ausente significa viva, y eso es lo que dice
// `null`.
const BIRTH_DEFAULTS = {
	notes: { title: '', folderId: null, agentVisible: false, deletedAt: null },
	blocks: {
		parentBlockId: null,
		type: 'text',
		content: '',
		order: 0,
		checked: false,
		collapsed: false,
		codeCollapsed: false,
		note: '',
		dueDate: null,
		createdBy: 'user',
		deletedAt: null
	},
	// De una línea de bitácora que llega ya borrada no se sabe quién la escribió ni
	// qué decía, y la forma local pide las dos como texto. Queda como una línea
	// vacía y borrada, que es exactamente lo que es.
	activity: { actor: 'user', action: '', text: '', deletedAt: null }
};

// Los que llevan una fecha, y por eso no pueden vivir en la tabla de arriba.
const TIMESTAMP_FIELDS = {
	notes: ['createdAt', 'updatedAt'],
	blocks: ['createdAt', 'updatedAt'],
	activity: ['at']
};

// Sólo lo que falta, para poder llamarla sobre una fila que ya existe sin pisarle
// nada. Devuelve un objeto vacío cuando la fila está completa, que es lo que
// permite a la migración no reescribir de gusto.
export function missingShapeFields(table, row, timestamp) {
	const missing = {};
	for (const [field, value] of Object.entries(BIRTH_DEFAULTS[table] ?? {})) {
		if (row[field] === undefined) missing[field] = value;
	}
	for (const field of TIMESTAMP_FIELDS[table] ?? []) {
		if (row[field] === undefined) missing[field] = timestamp;
	}
	return missing;
}
