// Backup validation (specs/018). Valibot checks shape and field types; the
// referential checks (noteId, parentBlockId, tagId, targets) run afterwards
// because they need to see the whole backup, not one record at a time.
// Nothing here touches storage — validation must never mutate local data.

import * as v from 'valibot';
import { BLOCK_TYPES } from '../format/blocktype';
import { missingShapeFields } from '../storage/shape';

export const SUPPORTED_FORMAT = 'copynotes.backup';
// Version 2 added the heading block types; version 3 added the optional block
// dueDate; version 4 (spec 022) added the folders table plus the optional
// sortOrder/folderId organization fields; version 5 (spec 030 phase 0) added
// the activity table so the task bitácora survives a backup round-trip.
// Shapes are otherwise identical, so older versions import with no migration.
export const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5];
export const CURRENT_VERSION = 5;

const isoTimestamp = v.pipe(v.string(), v.isoTimestamp());
const nullableTimestamp = v.nullable(isoTimestamp);

const noteSchema = v.looseObject({
	id: v.string(),
	title: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const blockSchema = v.looseObject({
	id: v.string(),
	noteId: v.string(),
	parentBlockId: v.nullable(v.string()),
	type: v.picklist(BLOCK_TYPES),
	content: v.string(),
	// Shape check only — the inline html is sanitized at apply time by the
	// ingest gate (format/ingest.ts) before anything reaches storage.
	html: v.optional(v.string()),
	order: v.number(),
	collapsed: v.boolean(),
	codeCollapsed: v.optional(v.boolean()),
	checked: v.boolean(),
	dueDate: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
	note: v.optional(v.string()),
	// Spec 041. `looseObject` los dejaría pasar sin mirar; declararlos es lo que
	// hace que un archivo con un `imageId` que no es una huella se rechace.
	imageId: v.optional(v.nullable(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)))),
	imageType: v.optional(v.nullable(v.picklist(['image/png', 'image/jpeg', 'image/webp', 'image/gif']))),
	imageBytes: v.optional(v.nullable(v.number())),
	imageWidth: v.optional(v.nullable(v.number())),
	imageHeight: v.optional(v.nullable(v.number())),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

// A snippet's saved block tree (id-free nodes, same shape the clipboard
// format uses). Recursive, so it needs v.lazy.
const snapshotNodeSchema = v.looseObject({
	type: v.picklist(BLOCK_TYPES),
	content: v.string(),
	html: v.optional(v.string()),
	checked: v.optional(v.boolean()),
	codeCollapsed: v.optional(v.boolean()),
	dueDate: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
	note: v.optional(v.string()),
	children: v.array(v.lazy(() => snapshotNodeSchema))
});

const snippetSchema = v.looseObject({
	id: v.string(),
	name: v.string(),
	content: v.string(),
	html: v.optional(v.string()),
	blockSnapshot: v.nullish(snapshotNodeSchema),
	isFavorite: v.boolean(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const tagSchema = v.looseObject({
	id: v.string(),
	name: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const folderSchema = v.looseObject({
	id: v.string(),
	kind: v.picklist(['note', 'snippet']),
	name: v.string(),
	sortOrder: v.number(),
	collapsed: v.boolean(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

const tagAssignmentSchema = v.looseObject({
	id: v.string(),
	tagId: v.string(),
	targetType: v.picklist(['note', 'block', 'snippet']),
	targetId: v.string(),
	createdAt: isoTimestamp,
	updatedAt: isoTimestamp,
	deletedAt: nullableTimestamp
});

// One line of a task's bitácora (spec 028). `action` is a plain string, not a
// picklist: a history verb an older app doesn't recognise should still be kept
// and shown as-is — losing user history is worse than showing a stray label.
// `seq` is the device-local ordering counter; it is carried so an imported
// history keeps its internal order.
// `blockId` is nullable because an entry can be about the whole note rather than
// one of its lines (spec 038 §8, "Listo"). It must stay nullable even in an app
// that cannot yet write one: a file carrying one is rejected whole, not per row,
// so the tolerance is only worth anything if it shipped BEFORE the feature did.
const activitySchema = v.looseObject({
	id: v.string(),
	blockId: v.nullable(v.string()),
	noteId: v.string(),
	actor: v.string(),
	action: v.string(),
	text: v.optional(v.string(), ''),
	seq: v.optional(v.number()),
	at: isoTimestamp,
	deletedAt: nullableTimestamp
});

const settingSchema = v.looseObject({
	key: v.string(),
	value: v.unknown(),
	updatedAt: isoTimestamp
});

const backupSchema = v.looseObject({
	format: v.literal(SUPPORTED_FORMAT),
	formatVersion: v.number(),
	exportedAt: isoTimestamp,
	counts: v.looseObject({}),
	// Ausente = completo, y en ese orden importa: todos los archivos que la gente ya
	// tiene bajados no traen el campo y todos son completos. Al revés, "Reemplazar
	// todo" desaparecería de golpe de cada uno de ellos.
	complete: v.optional(v.boolean(), true),
	data: v.looseObject({
		notes: v.array(noteSchema),
		blocks: v.array(blockSchema),
		snippets: v.array(snippetSchema),
		tags: v.array(tagSchema),
		tagAssignments: v.array(tagAssignmentSchema),
		folders: v.optional(v.array(folderSchema), []),
		activity: v.optional(v.array(activitySchema), []),
		settings: v.array(settingSchema)
	})
});

// Organization fields (spec 022) are best-effort: a bad sortOrder or a
// folderId pointing nowhere must not sink a whole backup. Normalize in place
// after shape validation (looseObject lets these through unchecked, so this
// pass is the actual gate). Returns true when something was dropped.
function normalizeOrganization(data) {
	let touched = false;
	// A NEGATIVE position is not malformed: `storage/organize.ts` gives a note
	// created at the top of the sidebar `lowest - 1`, so this app's own backups
	// are full of them. Dropping it rewrote the row, and a rewritten row stops
	// matching its local twin — which duplicated every top-created note on a
	// re-import of your own file. Only a non-integer is really unusable here.
	const dropOrder = (row) => {
		if (row.sortOrder !== undefined && !Number.isInteger(row.sortOrder)) {
			delete row.sortOrder;
			touched = true;
		}
	};
	const folderIdsByKind = { note: new Set(), snippet: new Set() };
	for (const folder of data.folders) {
		dropOrder(folder);
		folderIdsByKind[folder.kind].add(folder.id);
	}
	const fixItems = (rows, kind) => {
		for (const row of rows) {
			dropOrder(row);
			if (row.folderId !== undefined && row.folderId !== null) {
				if (typeof row.folderId !== 'string' || !folderIdsByKind[kind].has(row.folderId)) {
					row.folderId = null;
					touched = true;
				}
			}
		}
	};
	fixItems(data.notes, 'note');
	fixItems(data.snippets, 'snippet');
	for (const tag of data.tags) dropOrder(tag);
	return touched;
}

// A bitácora line whose task is gone has nothing to attach to. Unlike a
// dangling block — which is a hard error, because it would strand real content
// — a stray history line is dropped with a warning: the backup is the user's
// safety net, and one lost log line must never cost them the whole restore.
function dropDanglingActivity(data, existing) {
	const noteIds = new Set([...data.notes.map((note) => note.id), ...existing.existingNoteIds]);
	const blockIds = new Set([...data.blocks.map((block) => block.id), ...existing.existingBlockIds]);
	// A null `blockId` is a note-level entry, not a dangling one: it has no block
	// to be missing, so only its note has to exist.
	const kept = data.activity.filter(
		(row) => (row.blockId === null || blockIds.has(row.blockId)) && noteIds.has(row.noteId)
	);
	const dropped = data.activity.length - kept.length;
	data.activity = kept;
	return dropped;
}

// Device-local bookkeeping that must never survive a trip through a file.
// `storage/backup.ts` strips these on the way OUT; this is the same list read on
// the way IN, because a file is untrusted no matter who wrote it.
//
// `fromCloud` is the sharpest of the three: `db.ts`'s write hooks read it as
// "this change did not happen here, do not stamp it", so a row carrying it lands
// with no `changeSeq` — invisible to the index the uploader reads, and therefore
// never synced, silently and for ever. `changeSeq`/`cloudSeq` are the same class
// of lie: a claim about this device made by another one.
//
// `share` (spec 038) joins them, and it is the same class of lie one level up: a
// restored file must not claim a note is shared. If it does, `sync/pending.ts`
// skips that note's rows for ever and the note stops syncing in silence — while
// the truth is one `list_shares()` away on the next pass. This is the shape the
// agent kill switch already got wrong once, in the other direction: a restore
// un-paused agents nobody had un-paused.
// `serverSeq` (spec 038 §5) es el mismo caño y el mismo tipo de mentira una
// tabla más abajo: es el orden que un servidor le dio a esa línea de bitácora.
// Colado desde un archivo decidiría un tilde —la deducción ordena por ese
// número— con un valor que nadie repartió.
export const LOCAL_ONLY_FIELDS = ['changeSeq', 'cloudSeq', 'fromCloud', 'share', 'serverSeq'];

// Las claves que un respaldo PUEDE llevar, por tabla. Lista blanca, y por el mismo
// motivo que `sync/shared-payload.ts`: lo que falla de una lista negra es una fuga
// que nadie nota, lo que falla de una blanca es un test rojo.
//
// Es el guardián del caño número tres (spec 040, regla 4). Cada caño nuevo le agrega
// campos a las filas —`changeSeq`, `cloudSeq`, `fromCloud`, `share`— y todos son de
// ESTE aparato: un archivo no puede hacer afirmaciones sobre un servidor. El caño 2
// se olvidó de `share` y el archivo se lo llevó puesto; se encontró a mano, semanas
// después. Esta lista lo habría cazado el mismo día, y está comprobado: quitar
// `share` de `LOCAL_ONLY_FIELDS` pone en rojo la prueba de `storage/backup.test.ts`.
//
// Medida el 2026-08-16 volcando una base sembrada con los repositorios de verdad, no
// escrita a mano. Un campo nuevo se agrega acá A PROPÓSITO, o el test lo rechaza.
export const EXPORTED_FIELDS = {
	notes: [
		'agentVisible',
		'createdAt',
		'deletedAt',
		'folderId',
		'id',
		'sortOrder',
		'title',
		'updatedAt'
	],
	blocks: [
		'checked',
		'codeCollapsed',
		'collapsed',
		'content',
		'createdAt',
		'createdBy',
		'deletedAt',
		'dueDate',
		'html',
		'id',
		'imageBytes',
		'imageHeight',
		'imageId',
		'imageType',
		'imageWidth',
		'note',
		'noteId',
		'order',
		'parentBlockId',
		'type',
		'updatedAt'
	],
	snippets: [
		'blockSnapshot',
		'content',
		'createdAt',
		'deletedAt',
		'folderId',
		'id',
		'isFavorite',
		'name',
		'sortOrder',
		'sourceBlockId',
		'sourceNoteId',
		'updatedAt'
	],
	tags: ['color', 'createdAt', 'deletedAt', 'id', 'name', 'sortOrder', 'updatedAt'],
	tagAssignments: ['createdAt', 'deletedAt', 'id', 'tagId', 'targetId', 'targetType', 'updatedAt'],
	folders: ['collapsed', 'createdAt', 'deletedAt', 'id', 'kind', 'name', 'sortOrder', 'updatedAt'],
	activity: ['action', 'actor', 'at', 'blockId', 'deletedAt', 'id', 'noteId', 'seq', 'text'],
	settings: ['key', 'updatedAt', 'value']
};

const ID_TABLES = ['notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'folders', 'activity'];

function stripLocalOnlyFields(data) {
	for (const name of ID_TABLES) {
		for (const row of data[name] ?? []) {
			for (const field of LOCAL_ONLY_FIELDS) delete row[field];
		}
	}
}

// Two rows claiming one id inside the same table. The import writes with
// `bulkAdd`, so this used to surface as a raw Dexie ConstraintError from inside
// the transaction — a wall of text that named neither the table nor the id.
// Ids are only unique WITHIN a table, so each table is counted on its own.
function duplicateIdErrors(data) {
	const errors = [];
	for (const name of ID_TABLES) {
		const seen = new Set();
		const reported = new Set();
		for (const row of data[name] ?? []) {
			if (seen.has(row.id) && !reported.has(row.id)) {
				errors.push(`El respaldo trae dos filas de ${name} con el mismo id (${row.id}).`);
				reported.add(row.id);
			}
			seen.add(row.id);
		}
	}
	return errors;
}

function formatIssues(issues) {
	return issues.map((issue) => {
		const path = (issue.path ?? []).map((segment) => segment.key).join('.');
		return path ? `${path}: ${issue.message}` : issue.message;
	});
}

function referenceErrors(data, existing) {
	const errors = [];
	const noteIds = new Set([...data.notes.map((note) => note.id), ...existing.existingNoteIds]);
	const blockIds = new Set([...data.blocks.map((block) => block.id), ...existing.existingBlockIds]);
	const tagIds = new Set([...data.tags.map((tag) => tag.id), ...existing.existingTagIds]);
	const snippetIds = new Set([
		...data.snippets.map((snippet) => snippet.id),
		...existing.existingSnippetIds
	]);
	// Un padre que existe no alcanza: si está en otra nota, o si la cadena de
	// padres se muerde la cola, el renglón deja de dibujarse. `buildVisibleList`
	// sólo baja desde la raíz, y nada de eso es alcanzable desde ahí — entraría al
	// archivo y desaparecería de la pantalla sin decir nada.
	const noteOfBlock = new Map(data.blocks.map((block) => [block.id, block.noteId]));
	for (const block of data.blocks) {
		if (!noteIds.has(block.noteId))
			errors.push(`El bloque ${block.id} apunta a una nota inexistente (${block.noteId}).`);
		if (block.parentBlockId !== null && !blockIds.has(block.parentBlockId))
			errors.push(`El bloque ${block.id} apunta a un bloque padre inexistente.`);
		else if (
			noteOfBlock.has(block.parentBlockId) &&
			noteOfBlock.get(block.parentBlockId) !== block.noteId
		)
			errors.push(`El bloque ${block.id} cuelga de un bloque de otra nota.`);
	}
	// Un padre fuera del archivo (uno local) corta la cadena: no se puede seguir, y
	// tampoco puede cerrar un círculo acá adentro.
	const parentOf = new Map(data.blocks.map((block) => [block.id, block.parentBlockId]));
	const walked = new Set();
	for (const block of data.blocks) {
		const path = new Set();
		let id = block.id;
		while (parentOf.has(id) && !walked.has(id)) {
			if (path.has(id)) {
				errors.push(`El bloque ${id} está en un círculo de bloques padre.`);
				break;
			}
			path.add(id);
			id = parentOf.get(id);
		}
		for (const seen of path) walked.add(seen);
	}
	const targetSets = { note: noteIds, block: blockIds, snippet: snippetIds };
	for (const assignment of data.tagAssignments) {
		if (!tagIds.has(assignment.tagId))
			errors.push(`La asignación ${assignment.id} apunta a una etiqueta inexistente.`);
		const targets = targetSets[assignment.targetType];
		if (targets && !targets.has(assignment.targetId))
			errors.push(`La asignación ${assignment.id} apunta a un destino inexistente.`);
	}
	return errors;
}

// The tables a backup file carries — the one list, imported by the builder
// (export-import/backup.ts) and by the storage side (storage/backup.ts). Three
// copies of it used to live side by side; a table added to one and not the
// others would have been dumped and never restored, or validated and never
// written.
//
// `activity` (the task bitácora) is part of the portable backup as of spec 030
// phase 0: it is user-visible history, and leaving it out meant every
// backup/restore round-trip silently erased it.
export const BACKUP_TABLES = [
	'notes',
	'blocks',
	'snippets',
	'tags',
	'tagAssignments',
	'folders',
	'activity',
	'settings'
];

// Un campo que falta se completa desde la ÚNICA lista de la forma local
// (`storage/shape.ts`, la misma que usan `createBlock` y la migración v12), y el
// archivo entra con un aviso. Nunca un error: un respaldo que la app bajó tiene que
// poder restaurarse siempre (spec 040, regla 1).
//
// COMPLETAR y no relajar el esquema, y la diferencia está medida: `planMerge`
// compara filas enteras con `identical()`, así que una fila sin `collapsed` no es
// igual a la local que sí lo tiene y se DUPLICA — 1 agregada y 0 omitidas, con un
// archivo idéntico a lo que el aparato ya tenía. Relajar el control deja entrar el
// archivo y te duplica la base; completarlo lo deja entrar y encajar.
//
// Sobre una copia y no sobre lo que vino: `BackupDialog` valida el MISMO objeto dos
// veces (una con tus ids, otra sin ellos) y un validador no edita los datos de quien
// lo llama.
//
// Y se completa SÓLO lo que el validador reclamó, no todo lo que la forma local
// sabe llenar. Medido: completar de más rompe lo mismo que se está arreglando —
// `folderId` y `agentVisible` son opcionales en el archivo, y ponerlos en una fila
// que venía sin ellos la vuelve distinta de la local, o sea que el merge la duplica.
// Los reclamos del propio esquema son la lista exacta de "obligatorio y ausente", y
// no hay que mantenerla a mano: la dice él.
const SHAPED_TABLES = ['notes', 'blocks', 'activity'];

function fillFromIssues(raw, issues) {
	const timestamp = new Date().toISOString();
	let data = null;
	for (const issue of issues) {
		const keys = (issue.path ?? []).map((segment) => segment.key);
		if (keys.length !== 4 || keys[0] !== 'data') continue;
		const [, table, index, field] = keys;
		if (!SHAPED_TABLES.includes(table)) continue;
		const defaults = missingShapeFields(table, {}, timestamp);
		if (!(field in defaults)) continue;
		const row = raw.data?.[table]?.[index];
		if (typeof row !== 'object' || row === null || row[field] !== undefined) continue;
		if (!data) data = { ...raw.data };
		if (data[table] === raw.data[table]) data[table] = [...raw.data[table]];
		data[table][index] = { ...data[table][index], [field]: defaults[field] };
	}
	return data === null ? null : { ...raw, data };
}

// Returns { ok, backup?, errors, warnings }. Counts that disagree with the
// actual arrays are a warning, not an error: the arrays are the truth.
export function validateBackup(raw, existingIds = undefined) {
	const existing = {
		existingNoteIds: existingIds?.existingNoteIds ?? [],
		existingBlockIds: existingIds?.existingBlockIds ?? [],
		existingTagIds: existingIds?.existingTagIds ?? [],
		existingSnippetIds: existingIds?.existingSnippetIds ?? []
	};
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return {
			ok: false,
			errors: ['El archivo no es un respaldo de CopyNotes.'],
			details: [],
			warnings: []
		};
	}
	if (raw.format !== SUPPORTED_FORMAT) {
		return {
			ok: false,
			errors: ['El archivo no es un respaldo de CopyNotes.'],
			details: [],
			warnings: []
		};
	}
	if (!SUPPORTED_VERSIONS.includes(raw.formatVersion)) {
		return {
			ok: false,
			errors: [
				`Este respaldo usa una versión (${raw.formatVersion}) que esta versión de CopyNotes no puede leer.`
			],
			details: [],
			warnings: []
		};
	}
	let parsed = v.safeParse(backupSchema, raw);
	let filled = false;
	if (!parsed.success) {
		// Un solo reintento, y con lo que el propio esquema reclamó. Si sigue fallando,
		// los reclamos que quedan son los de verdad y son los que se cuentan.
		const completed = fillFromIssues(raw, parsed.issues);
		if (completed !== null) {
			parsed = v.safeParse(backupSchema, completed);
			filled = parsed.success;
		}
	}
	if (!parsed.success) {
		// Una persona no puede hacer nada con "data.blocks.718.collapsed: Invalid key".
		// Lo que sí puede hacer algo es saber que el archivo está dañado, cuántos
		// renglones lo están, y que no se tocó nada de lo suyo. El detalle sigue
		// disponible en `details` para el registro.
		const details = formatIssues(parsed.issues);
		const rows = new Set(details.map((line) => line.slice(0, line.lastIndexOf('.'))));
		const count = rows.size || details.length;
		return {
			ok: false,
			errors: [
				count === 1
					? 'Este archivo no se puede leer como respaldo: 1 renglón está dañado o incompleto. No se tocó nada de lo tuyo.'
					: `Este archivo no se puede leer como respaldo: ${count} renglones están dañados o incompletos. No se tocó nada de lo tuyo.`
			],
			details,
			warnings: []
		};
	}
	const backup = parsed.output;
	// Before any referential check: a file that contradicts itself about which
	// row is which cannot be reasoned about, and the ids are what every other
	// check is keyed on.
	const idErrors = duplicateIdErrors(backup.data);
	if (idErrors.length > 0) {
		return { ok: false, errors: idErrors, details: [], warnings: [] };
	}
	const refErrors = referenceErrors(backup.data, existing);
	if (refErrors.length > 0) {
		return { ok: false, errors: refErrors, details: [], warnings: [] };
	}
	// Silent, not a warning: these fields are never something the person chose to
	// put in the file, so there is nothing for them to act on.
	stripLocalOnlyFields(backup.data);
	const warnings = [];
	// Sin los nombres de los campos: no es algo sobre lo que una persona pueda hacer
	// nada (decisión de Hernán, 2026-08-16).
	if (filled) {
		warnings.push(
			'Este archivo venía de una versión anterior de CopyNotes y se completó al importarlo.'
		);
	}
	if (normalizeOrganization(backup.data)) {
		warnings.push(
			'Se descartaron datos de orden o carpeta inválidos; esos elementos quedan en la lista general.'
		);
	}
	const droppedActivity = dropDanglingActivity(backup.data, existing);
	if (droppedActivity > 0) {
		warnings.push(
			`Se descartaron ${droppedActivity} línea(s) de bitácora cuya tarea ya no existe; el resto del respaldo se importa igual.`
		);
	}
	const counts = {
		notes: backup.data.notes.length,
		blocks: backup.data.blocks.length,
		snippets: backup.data.snippets.length,
		tags: backup.data.tags.length,
		tagAssignments: backup.data.tagAssignments.length,
		folders: backup.data.folders.length,
		activity: backup.data.activity.length,
		settings: backup.data.settings.length
	};
	for (const table of BACKUP_TABLES) {
		const declared = raw.counts?.[table];
		if (declared !== undefined && declared !== counts[table]) {
			warnings.push(`El conteo declarado de ${table} no coincide; se recalculó.`);
		}
	}
	return { ok: true, backup: { ...backup, counts }, errors: [], details: [], warnings };
}
