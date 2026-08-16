# Contrato del respaldo (spec 040) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A backup the app produced can always be restored, and the third sync pipe cannot repeat the second one's two mistakes — enforced by two tests, not by memory.

**Architecture:** One list of shape defaults (`storage/shape.ts`) already exists and is already shared by `sync/shared-merge.ts` and migration v12. This plan makes the **import gate** read the same list, so a file missing a field is completed instead of rejected — and adds two guards: a minimal-row backup that must validate (catches a new required field) and an allow-list over the keys a dump may contain (catches a pipe field leaking into the file). Then the envelope learns to say how complete it is, and the copy learns to say the file is readable.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie/IndexedDB, valibot, vitest (two projects: `server`/node and `jsdom`), Playwright.

## Global Constraints

- **Spec:** `specs/040-backup-compatibility-contract.md`. Its "Decisions taken" section is settled — no task stops to ask.
- **Plain JavaScript inside `.ts`/`.svelte`**: no type annotations in hand-written code (project CLAUDE.md).
- **`pnpm check` has exactly 4 pre-existing errors.** A 5th is yours — this bit twice on this branch (`new Map([...map()])` and a bare property assignment on `{}`). Run it before every commit.
- **`storage/shape.ts` and `export-import/*` must not import the database.** The node test project has no IndexedDB and pure modules import them.
- **Do not relax the backup schema.** Measured: a row let through unfilled duplicates on merge (`identical()` compares whole records). Fill, keep the schema strict.
- **Absent `complete` means complete.** Backwards, it removes *Reemplazar todo* from every file already downloaded.
- **Do not touch** `push_records`, `decide()`, `planMerge`'s rules, or 039's account claim.
- **`docs/guia/11-respaldo.md` and `CHANGELOG.md` change in the same commit as the behaviour** (project rules), plus the guide index date in `docs/guia-de-uso.md`.
- Tests that need `DOMParser`/`sanitizeHtml` or `fake-indexeddb` go in the **jsdom** project's explicit include list in `vite.config.ts`; pure validator tests stay in node.
- Verified 2026-08-16: `git branch -vv` shows no upstream for `feat/nota-compartida` and `498bed6` (migration v12) is in **no** remote branch. Migration v12 has therefore never run on any device except tests. Task 1 depends on this.

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/lib/storage/shape.ts` | the one list of shape defaults. Gains `deletedAt`. |
| `src/lib/storage/db.ts` | migration v12 repairs rows with the completed list |
| `src/lib/export-import/schema.ts` | fills missing shape fields before validating; declares `EXPORTED_FIELDS`; `complete` on the envelope; plain-language error text |
| `src/lib/export-import/backup.ts` | writes `complete` into the envelope |
| `src/lib/storage/backup.test.ts` | the allow-list guard (needs a real dump → jsdom project) |
| `src/lib/components/BackupDialog.svelte` | export self-check, plain-language error, "es legible" line, refuses an incomplete file for *Reemplazar todo* |
| `AGENT.md` | the five-list checklist for a new pipe |
| `docs/guia/11-respaldo.md`, `docs/guia-de-uso.md`, `CHANGELOG.md` | what the person sees |

---

### Task 1: `deletedAt` joins the one list

A row that reaches the file without `deletedAt` is rejected by the validator, exactly like `collapsed` was. It is the third instance of the same hole and the only one still open. Because v12 has never run anywhere (see Global Constraints), its body is **extended** rather than a v13 being added.

**Files:**
- Modify: `src/lib/storage/shape.ts`
- Test: `src/lib/storage/shape.test.ts` (create if absent), `src/lib/storage/db.migrations.test.ts`

- [x] **Step 1: Write the failing test** — append to `src/lib/storage/shape.test.ts` (create the file with this content if it does not exist):

```javascript
import { describe, expect, it } from 'vitest';
import { missingShapeFields } from './shape';

describe('la marca de borrado también se completa', () => {
	it('una fila sin deletedAt es una fila viva, no una fila inválida', () => {
		for (const table of ['notes', 'blocks', 'activity']) {
			expect(missingShapeFields(table, {}, '2026-08-16T00:00:00.000Z').deletedAt).toBe(null);
		}
	});

	it('y una lápida conserva su fecha de borrado', () => {
		const tomb = { deletedAt: '2026-08-01T00:00:00.000Z' };
		expect(missingShapeFields('notes', tomb, '2026-08-16T00:00:00.000Z').deletedAt).toBeUndefined();
	});
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/storage/shape.test.ts`
Expected: FAIL — `expected undefined to be null`.

- [x] **Step 3: Add the field to the one list**

In `src/lib/storage/shape.ts`, add `deletedAt: null` to `BIRTH_DEFAULTS` for the three tables, with the reason in a comment:

```javascript
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
	activity: { actor: 'user', action: '', text: '', deletedAt: null }
};
```

Above it, extend the file's comment with one line: `deletedAt` is required by the backup validator and the shared pipe omits any field that is `undefined` (`toSharedPayload`), so a live row whose `deletedAt` was never written arrives without it — the same failure as `collapsed`, one field over.

- [x] **Step 4: Run the test again**

Run: `pnpm vitest run src/lib/storage/shape.test.ts`
Expected: PASS.

- [x] **Step 5: Prove the migration heals it too**

Add to the v12 test in `src/lib/storage/db.migrations.test.ts` (the `it('v12: completa la forma…')` block), inside the existing assertions:

```javascript
			expect(stored.deletedAt).toBe(null);
```

The legacy seed in that test already writes a block with no `deletedAt`, so no seed change is needed. Run: `pnpm vitest run src/lib/storage/db.migrations.test.ts` → PASS (v12's body already loops over `missingShapeFields`, so extending the list is all that was required).

- [x] **Step 6: Commit**

```bash
git add src/lib/storage/shape.ts src/lib/storage/shape.test.ts src/lib/storage/db.migrations.test.ts
git commit -m "fix(respaldo): la marca de borrado también se completa cuando falta"
```

---

### Task 2: A file missing a field is completed, not rejected

The two measurements at the top of the spec, turned around. This is the task that revives the .json files already on disk.

**Files:**
- Modify: `src/lib/export-import/schema.ts`
- Test: `src/lib/export-import/schema.test.ts`

**Interfaces:**
- Consumes: `missingShapeFields(table, row, timestamp)` from Task 1 (`src/lib/storage/shape.ts`) — returns only the absent fields, `{}` for a complete row.
- Produces: `validateBackup(raw, existingIds?)` unchanged in signature; its `warnings` array may now contain the completion notice.

- [x] **Step 1: Write the failing tests** — append to `src/lib/export-import/schema.test.ts`:

```javascript
// El bug del gate manual del 2026-08-15: un respaldo que la app misma bajó no se
// podía importar porque a un renglón le faltaba `collapsed`. Medido: rechazo
// entero. Y si se dejara pasar sin completar, el merge lo duplicaría — por eso se
// COMPLETA en vez de relajar el control.
describe('un archivo de una versión anterior entra igual', () => {
	const iso = '2026-08-01T10:00:00.000Z';
	const bareBlock = {
		id: 'b1',
		noteId: 'n1',
		parentBlockId: null,
		type: 'text',
		content: 'texto',
		html: 'texto',
		order: 0,
		checked: false,
		createdAt: iso,
		updatedAt: iso,
		deletedAt: null
	};
	const fileWith = (block) => ({
		format: 'copynotes.backup',
		formatVersion: 5,
		exportedAt: iso,
		counts: {},
		data: {
			notes: [{ id: 'n1', title: 'T', createdAt: iso, updatedAt: iso, deletedAt: null }],
			blocks: [block],
			snippets: [],
			tags: [],
			tagAssignments: [],
			folders: [],
			activity: [],
			settings: []
		}
	});

	it('un renglón sin collapsed no tira el respaldo entero', () => {
		const result = validateBackup(fileWith(bareBlock));
		expect(result.ok).toBe(true);
		expect(result.backup.data.blocks[0].collapsed).toBe(false);
		expect(result.warnings.join(' ')).toContain('versión anterior');
	});

	it('una fila sin la marca de borrado tampoco', () => {
		const { deletedAt, ...noTomb } = bareBlock;
		const result = validateBackup(fileWith({ ...noTomb, collapsed: false }));
		expect(result.ok).toBe(true);
		expect(result.backup.data.blocks[0].deletedAt).toBe(null);
	});

	it('y completado queda IDÉNTICO a la fila local, así el merge no lo duplica', () => {
		const result = validateBackup(fileWith(bareBlock));
		const local = {
			notes: result.backup.data.notes,
			blocks: [{ ...result.backup.data.blocks[0] }],
			snippets: [],
			tags: [],
			tagAssignments: [],
			folders: [],
			activity: [],
			settings: []
		};
		const plan = planMerge(local, result.backup.data, { createId: () => 'nuevo' });
		expect(plan.summary.blocks.added).toBe(0);
		expect(plan.summary.blocks.skipped).toBe(1);
	});

	it('un archivo completo no dice nada de versiones anteriores', () => {
		const result = validateBackup(fileWith({ ...bareBlock, collapsed: false, note: '', codeCollapsed: false, dueDate: null, createdBy: 'user' }));
		expect(result.ok).toBe(true);
		expect(result.warnings.join(' ')).not.toContain('versión anterior');
	});
});
```

Add `import { planMerge } from './merge';` to the top of the file if it is not already imported.

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: FAIL — the first with `expected false to be true` and the error `data.blocks.0.collapsed: Invalid key: Expected "collapsed" but received undefined`; the third with `expected 1 to be 0`.

- [x] **Step 3: Fill before validating**

In `src/lib/export-import/schema.ts`, import the one list and add the fill. It runs **before** `v.safeParse`, on a shallow copy — `BackupDialog` calls `validateBackup` twice on the same parsed object, and a validator must not edit its caller's data:

```javascript
import { missingShapeFields } from '../storage/shape';
```

```javascript
// Un campo que falta se completa desde la ÚNICA lista de la forma local
// (`storage/shape.ts`, la misma que usan `createBlock` y la migración v12), y el
// archivo entra con un aviso. Nunca un error: un respaldo que la app bajó tiene
// que poder restaurarse siempre (spec 040 regla 1).
//
// COMPLETAR y no relajar el esquema, y la diferencia está medida: `planMerge`
// compara filas enteras con `identical()`, así que una fila sin `collapsed` no es
// igual a la local que sí lo tiene y se DUPLICA (medido: 1 agregada, 0 omitidas,
// con un archivo idéntico a lo que el aparato ya tenía).
//
// Sobre una copia y no sobre lo que vino: `BackupDialog` valida el mismo objeto
// dos veces (una con tus ids, otra sin ellos) y un validador no edita los datos
// de quien lo llama.
const SHAPED_TABLES = ['notes', 'blocks', 'activity'];

function withShapeFilled(raw) {
	if (typeof raw?.data !== 'object' || raw.data === null) return { data: raw, filled: false };
	const timestamp = new Date().toISOString();
	let filled = false;
	const data = { ...raw.data };
	for (const table of SHAPED_TABLES) {
		const rows = data[table];
		if (!Array.isArray(rows)) continue;
		data[table] = rows.map((row) => {
			if (typeof row !== 'object' || row === null) return row;
			const missing = missingShapeFields(table, row, timestamp);
			if (Object.keys(missing).length === 0) return row;
			filled = true;
			return { ...row, ...missing };
		});
	}
	return { data: { ...raw, data }, filled };
}
```

Then wire it into `validateBackup`, replacing the `const parsed = v.safeParse(backupSchema, raw);` line:

```javascript
	const { data: shaped, filled } = withShapeFilled(raw);
	const parsed = v.safeParse(backupSchema, shaped);
```

and add the warning next to the other two, after `stripLocalOnlyFields(backup.data)`:

```javascript
	const warnings = [];
	if (filled) {
		warnings.push(
			'Este archivo venía de una versión anterior de CopyNotes y se completó al importarlo.'
		);
	}
```

(Decision 1 of the spec: the warning does **not** list the field names.)

- [x] **Step 4: Run the tests again**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts src/lib/export-import/merge.test.ts src/lib/storage/backup.test.ts`
Expected: PASS, and no previously passing test broken.

- [x] **Step 5: Full suite + check**

Run: `pnpm test` then `pnpm check`
Expected: green; `pnpm check` at exactly its 4 pre-existing errors.

- [x] **Step 6: Commit**

```bash
git add src/lib/export-import/schema.ts src/lib/export-import/schema.test.ts
git commit -m "fix(respaldo): un archivo de una versión anterior se completa en vez de rechazarse"
```

---

### Task 3: The guard that fails when a required field is added

Rule 3's mechanism. A backup built out of nothing but ids, references and the shape defaults must validate. It touches no valibot internals.

**Files:**
- Test: `src/lib/export-import/schema.test.ts`

- [x] **Step 1: Write the guard**

```javascript
// EL GUARDIÁN de la regla 3 (spec 040): un campo nuevo en la forma local es
// opcional en el respaldo o tiene valor por defecto en `storage/shape.ts`. Nunca
// ninguno de los dos.
//
// Este test arma un respaldo con lo MÍNIMO —ids, referencias, y lo que
// `missingShapeFields` sabe completar— y exige que valide. El día que alguien
// agregue un campo obligatorio a `blockSchema` sin default, esto se pone rojo en
// tres segundos. La alternativa era acordarse: se acordó bien cinco veces
// seguidas y a la sexta salió el bug del 2026-08-15.
it('un respaldo armado con lo mínimo indispensable valida', () => {
	const timestamp = '2026-08-16T00:00:00.000Z';
	const minimal = (table, identity) => ({ ...identity, ...missingShapeFields(table, {}, timestamp) });
	const result = validateBackup({
		format: 'copynotes.backup',
		formatVersion: 5,
		exportedAt: timestamp,
		counts: {},
		data: {
			notes: [minimal('notes', { id: 'n1' })],
			blocks: [minimal('blocks', { id: 'b1', noteId: 'n1' })],
			activity: [minimal('activity', { id: 'a1', noteId: 'n1', blockId: 'b1' })],
			snippets: [],
			tags: [],
			tagAssignments: [],
			folders: [],
			settings: []
		}
	});
	expect(result.errors).toEqual([]);
	expect(result.ok).toBe(true);
});
```

Add `import { missingShapeFields } from '../storage/shape';` to the test file.

- [x] **Step 2: Run it — it must PASS**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: PASS (Task 2 made this true).

- [x] **Step 3: Prove the guard actually guards**

Temporarily add a required field to `blockSchema` in `src/lib/export-import/schema.ts`:

```javascript
	guardCanary: v.boolean(),
```

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: FAIL, naming `guardCanary`. **Then delete that line.** A guard whose red has never been seen is decoration.

- [x] **Step 4: Re-run and commit**

```bash
pnpm vitest run src/lib/export-import/schema.test.ts
git add src/lib/export-import/schema.test.ts
git commit -m "test(respaldo): un campo obligatorio nuevo rompe la prueba en vez de romper los archivos"
```

---

### Task 4: The allow-list over the keys a file may carry

Rule 4's mechanism, and the one that protects the third pipe. **Measured 2026-08-16** by dumping a database seeded through the real repositories — the lists below are that output, not a guess. Note what is absent from `notes`: `share`, `changeSeq` and `cloudSeq` were written by the seed and stripped by `LOCAL_ONLY_FIELDS`. **Had this test existed, it would have caught the `share` leak that shipped in pipe 2.**

**Files:**
- Modify: `src/lib/export-import/schema.ts` (declare the list next to `LOCAL_ONLY_FIELDS`)
- Test: `src/lib/storage/backup.test.ts` (a real dump needs `fake-indexeddb` → jsdom project; confirm the file is already in `vite.config.ts`'s jsdom include list, and add it if not)

- [x] **Step 1: Declare the list** in `src/lib/export-import/schema.ts`, right below `LOCAL_ONLY_FIELDS`:

```javascript
// Las claves que un respaldo PUEDE llevar, por tabla. Lista blanca, y por el
// mismo motivo que `sync/shared-payload.ts`: lo que falla de una lista negra es
// una fuga que nadie nota; lo que falla de una blanca es un test rojo.
//
// Es el guardián del caño número tres (spec 040 regla 4). Cada caño nuevo le
// agrega campos a las filas —`changeSeq`, `cloudSeq`, `fromCloud`, `share`— y
// TODOS son de este aparato: un archivo no puede hacer afirmaciones sobre un
// servidor. El caño 2 se olvidó de `share` y el archivo se lo llevó puesto; este
// test lo habría cazado el mismo día.
//
// Medido el 2026-08-16 volcando una base sembrada con los repositorios de verdad.
// Un campo nuevo se agrega acá A PROPÓSITO, o el test lo rechaza.
export const EXPORTED_FIELDS = {
	notes: ['agentVisible', 'createdAt', 'deletedAt', 'folderId', 'id', 'sortOrder', 'title', 'updatedAt'],
	blocks: [
		'checked', 'codeCollapsed', 'collapsed', 'content', 'createdAt', 'createdBy', 'deletedAt',
		'dueDate', 'html', 'id', 'note', 'noteId', 'order', 'parentBlockId', 'type', 'updatedAt'
	],
	snippets: [
		'blockSnapshot', 'content', 'createdAt', 'deletedAt', 'folderId', 'id', 'isFavorite', 'name',
		'sortOrder', 'sourceBlockId', 'sourceNoteId', 'updatedAt'
	],
	tags: ['color', 'createdAt', 'deletedAt', 'id', 'name', 'sortOrder', 'updatedAt'],
	tagAssignments: ['createdAt', 'deletedAt', 'id', 'tagId', 'targetId', 'targetType', 'updatedAt'],
	folders: ['collapsed', 'createdAt', 'deletedAt', 'id', 'kind', 'name', 'sortOrder', 'updatedAt'],
	activity: ['action', 'actor', 'at', 'blockId', 'deletedAt', 'id', 'noteId', 'seq', 'text'],
	settings: ['key', 'updatedAt', 'value']
};
```

- [x] **Step 2: Write the guard** in `src/lib/storage/backup.test.ts`:

```javascript
// EL GUARDIÁN del caño número tres (spec 040 regla 4).
//
// La siembra tiene que TOCAR TODOS LOS CAÑOS, o el guardián es ciego: por eso
// `setShareRole` está acá, y por eso el sello de cambio se escribe solo en cada
// `create*`. Un caño nuevo agrega su siembra acá.
it('un volcado no lleva ninguna clave que no esté declarada', async () => {
	const folder = await createFolder('note', 'F');
	const note = await createNote({ title: 'N', folderId: folder.id });
	const block = await createBlock({ noteId: note.id, type: 'todo', content: 'x', order: 0 });
	await createSnippet({ name: 'S', content: 'x', sourceNoteId: note.id, sourceBlockId: block.id });
	const tag = await createTag({ name: 't' });
	await assignTag(tag.id, 'note', note.id);
	await appendActivity({ blockId: block.id, noteId: note.id, actor: 'user', action: 'created' });
	await setTheme('dark');
	// Caño 1 (nube cifrada) y caño 2 (compartir): los dos escriben campos en la fila.
	await setShareRole(note.id, 'owner');

	const dump = await dumpAllTables();
	for (const [table, rows] of Object.entries(dump)) {
		expect(rows.length, `la siembra de ${table} quedó vacía y el guardián no mira nada`).toBeGreaterThan(0);
		const declared = new Set(EXPORTED_FIELDS[table]);
		const strays = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !declared.has(key));
		expect(strays, `claves no declaradas en ${table}`).toEqual([]);
	}
});
```

Imports the test file needs: `createFolder`, `createNote`, `createBlock`, `createSnippet`, `createTag`, `assignTag`, `appendActivity`, `setTheme`, `setShareRole`, `dumpAllTables`, and `EXPORTED_FIELDS` from `../export-import/schema`. Note the exact signatures — `createFolder(kind, name)` and `assignTag(tagId, targetType, targetId)` take positional arguments, the rest take an object.

- [x] **Step 3: Run it — it must PASS**

Run: `pnpm vitest run src/lib/storage/backup.test.ts`
Expected: PASS. If a key is reported as stray, **do not add it to the list reflexively** — first decide whether it should be in the file at all. That decision is the point of the test.

- [x] **Step 4: Prove the guard guards, in the way that matters**

Temporarily remove `'share'` from `LOCAL_ONLY_FIELDS` in `src/lib/export-import/schema.ts` — i.e. reproduce the exact bug pipe 2 shipped.

Run: `pnpm vitest run src/lib/storage/backup.test.ts`
Expected: FAIL — `claves no declaradas en notes: [ 'share' ]`. **Then restore the line.**

- [x] **Step 5: Commit**

```bash
pnpm check
git add src/lib/export-import/schema.ts src/lib/storage/backup.test.ts vite.config.ts
git commit -m "test(respaldo): lista blanca de las claves que un archivo puede llevar"
```

---

### Task 5: The envelope says how complete it is

Rule 6, minus every gram of hosting machinery: one field, one refusal, one written rule.

**Files:**
- Modify: `src/lib/export-import/backup.ts`, `src/lib/export-import/schema.ts`, `src/lib/components/BackupDialog.svelte`
- Test: `src/lib/export-import/backup.test.ts`, `src/lib/export-import/schema.test.ts`

**Interfaces:**
- Produces: `buildBackup(tables, meta)` writes `complete: true`. `validateBackup` output carries `backup.complete`, defaulting to `true` when the field is absent.

- [x] **Step 1: Write the failing tests**

In `src/lib/export-import/backup.test.ts`:

```javascript
it('el sobre dice que este aparato tenía todo', () => {
	const backup = buildBackup({ notes: [] }, { appVersion: '0.2.0', exportedAt: '2026-08-16T00:00:00.000Z' });
	expect(backup.complete).toBe(true);
});
```

In `src/lib/export-import/schema.test.ts`:

```javascript
// La trampa: TODOS los archivos que existen hoy no tienen este campo, y todos son
// completos (hasta que exista un alojamiento, el aparato tiene todo). Leer la
// ausencia como "incompleto" les saca "Reemplazar todo" a todos de golpe.
it('un archivo sin el campo se considera completo', () => {
	const result = validateBackup(validFile());
	expect(result.backup.complete).toBe(true);
});

it('y uno que se declara incompleto lo dice', () => {
	const result = validateBackup({ ...validFile(), complete: false });
	expect(result.ok).toBe(true);
	expect(result.backup.complete).toBe(false);
});
```

`validFile()` is the existing helper in that test file that returns a minimal valid backup — reuse it; if it is named differently, use whatever the file already uses for a valid backup object.

- [x] **Step 2: Run and watch them fail**

Run: `pnpm vitest run src/lib/export-import/backup.test.ts src/lib/export-import/schema.test.ts`
Expected: FAIL — `expected undefined to be true`.

- [x] **Step 3: Implement**

In `src/lib/export-import/backup.ts`, inside the returned object (after `exportedBy`):

```javascript
		// ¿Este aparato tenía TODO lo que hay que guardar? Hoy la respuesta es
		// siempre sí, porque el aparato es la fuente de la verdad. Un alojamiento en
		// la nube rompería justo esa premisa —el archivo diría "12 notas" con 400
		// arriba— y ahí este campo pasa a ser una pregunta de verdad (spec 040 regla 6).
		complete: true,
```

In `src/lib/export-import/schema.ts`, in `backupSchema`, next to `counts`:

```javascript
	// Ausente = completo. Al revés, "Reemplazar todo" desaparecería de TODOS los
	// archivos que la gente ya tiene bajados, que son completos todos.
	complete: v.optional(v.boolean(), true),
```

- [x] **Step 4: Run them again**

Run: `pnpm vitest run src/lib/export-import/backup.test.ts src/lib/export-import/schema.test.ts`
Expected: PASS.

- [x] **Step 5: Wire the refusal into the dialog**

In `src/lib/components/BackupDialog.svelte`, in `chooseBackupFile`, the `replaceData` line becomes:

```javascript
		// Un archivo que no se declara completo no puede reemplazar todo: el borrado
		// se llevaría lo que el archivo no puede reponer (spec 040 regla 6). Se
		// reusa el camino que ya existe para un archivo que no se sostiene solo.
		const standalone = validateBackup(parsed);
		const replaceData =
			standalone.ok && standalone.backup.complete === true
				? sanitizeBackupData(standalone.backup.data)
				: null;
		review = {
			fileName: opened.fileName,
			backup,
			warnings: result.warnings,
			plan,
			replaceData,
			incomplete: standalone.ok && standalone.backup.complete !== true
		};
```

And in the `reviewing` step's summary box, next to the existing `{#if !review.replaceData}` paragraph, branch on the reason:

```svelte
				{#if review.incomplete}
					<p class="text-muted-foreground mt-1">
						Este archivo no es una copia completa: el aparato que lo bajó no tenía todo. Se puede
						importar sumándolo a lo tuyo, pero no reemplazar todo con él.
					</p>
				{:else if !review.replaceData}
```

(keep the existing wording in the `else if` branch, and its closing `{/if}`.)

- [x] **Step 6: Run the suite and commit**

```bash
pnpm test && pnpm check
git add src/lib/export-import/backup.ts src/lib/export-import/schema.ts src/lib/components/BackupDialog.svelte src/lib/export-import/backup.test.ts src/lib/export-import/schema.test.ts
git commit -m "feat(respaldo): el archivo dice si es una copia completa, y sólo esa puede reemplazar todo"
```

---

### Task 6: What a person reads when something is wrong

Rule 7's first two halves: a Spanish sentence instead of a field path, and the app checking the file it just produced.

**Files:**
- Modify: `src/lib/export-import/schema.ts`, `src/lib/components/BackupDialog.svelte`
- Test: `src/lib/export-import/schema.test.ts`

- [x] **Step 1: Write the failing test**

```javascript
// Lo que Hernán vio el 2026-08-15 fue "data.blocks.718.collapsed: Invalid key:
// Expected "collapsed" but received undefined" en un cartelito, y era el PRIMERO
// de vaya a saber cuántos: el diálogo muestra `errors[0]` y nada más.
it('un archivo roto se explica en castellano y dice cuántos problemas tiene', () => {
	const file = validFile();
	file.data.blocks = [{ id: 'b1', noteId: 'n1' }, { id: 'b2', noteId: 'n1' }];
	const result = validateBackup(file);
	expect(result.ok).toBe(false);
	expect(result.errors[0]).toContain('no se puede leer');
	expect(result.errors[0]).toMatch(/2 problemas|2 renglones/);
	expect(result.errors[0]).not.toContain('Invalid key');
	// El detalle técnico no se pierde, sólo deja de ser lo primero que se lee.
	expect(result.details.join(' ')).toContain('Invalid key');
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: FAIL — `expected 'data.blocks.0.type: …' to contain 'no se puede leer'`.

- [x] **Step 3: Implement**

In `src/lib/export-import/schema.ts`, replace the early return for a failed parse:

```javascript
	if (!parsed.success) {
		const details = formatIssues(parsed.issues);
		// Una persona no puede hacer nada con "data.blocks.718.collapsed: Invalid
		// key". Lo que sí puede hacer algo es saber que el archivo está dañado, cuántos
		// renglones lo están, y que no se tocó nada de lo suyo. El detalle sigue
		// disponible en `details` para el registro y para nosotros.
		const rows = new Set(details.map((line) => line.split(':')[0]));
		return {
			ok: false,
			errors: [
				`Este archivo no se puede leer como respaldo: ${rows.size} ${rows.size === 1 ? 'renglón está' : 'renglones están'} dañado${rows.size === 1 ? '' : 's'} o incompleto${rows.size === 1 ? '' : 's'}. No se tocó nada de lo tuyo.`
			],
			details,
			warnings: []
		};
	}
```

Add `details: []` to the other returns of `validateBackup` so the shape is stable for every caller.

- [x] **Step 4: Run it again**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: PASS.

- [x] **Step 5: The export self-check**

In `src/lib/components/BackupDialog.svelte`, in `exportAllJson`, after `buildBackup` and **before** `saveTextFile`:

```javascript
			// La app revisa el respaldo que ella misma acaba de armar. Sin esto, un
			// archivo roto se baja en silencio y te enterás el día que lo necesitás —
			// que es exactamente lo que pasó el 2026-08-15 (spec 040 regla 7).
			//
			// Se baja IGUAL: un respaldo al que le falta un renglón sirve más que
			// ninguno, el mismo criterio que `settlePendingWrites`. Lo que cambia es que
			// el mensaje no puede decir que está sano.
			const selfCheck = validateBackup(JSON.parse(JSON.stringify(backup)));
```

and extend the message branch at the end:

```javascript
			if (!selfCheck.ok)
				toast.warning(
					'Respaldo descargado, pero le encontramos un problema al revisarlo. Guardalo y avisanos.'
				);
			else if (allSaved) toast.success('Respaldo descargado');
			else
				toast.warning(
					'Respaldo descargado — un cambio reciente no se pudo guardar y puede faltar.'
				);
```

The `JSON.parse(JSON.stringify(...))` is deliberate: `validateBackup` normalizes organization fields in place on its own copy, and the object being written to the file must not be touched by the check.

- [x] **Step 6: Add the unit test for the self-check path**

In `src/lib/export-import/schema.test.ts`:

```javascript
it('lo que la app acaba de armar pasa su propia revisión', () => {
	const backup = buildBackup(
		{ notes: [], blocks: [], snippets: [], tags: [], tagAssignments: [], folders: [], activity: [], settings: [] },
		{ appVersion: '0.2.0', exportedAt: '2026-08-16T00:00:00.000Z' }
	);
	expect(validateBackup(backup).ok).toBe(true);
});
```

- [x] **Step 7: Run the suite and commit**

```bash
pnpm test && pnpm check
git add src/lib/export-import/schema.ts src/lib/export-import/schema.test.ts src/lib/components/BackupDialog.svelte
git commit -m "feat(respaldo): los errores se explican en castellano y la app revisa lo que baja"
```

---

### Task 7: What the file admits, and the checklist for the next pipe

Rule 5 and rule 7's third half. Nothing here is optional: the guide and the changelog change in the same commit as the behaviour (project rules).

**Files:**
- Modify: `src/lib/components/BackupDialog.svelte`, `AGENT.md`, `docs/guia/11-respaldo.md`, `docs/guia-de-uso.md`, `CHANGELOG.md`
- Test: `e2e/backup.spec.ts` (or whichever e2e file already opens the Respaldo dialog — find it with `grep -rl "Respaldo" e2e/`)

- [x] **Step 1: The line next to the download button**

Decision 2 of the spec: it goes **next to the download button**, because the risk is created at download time. In the `idle` step's "Exportar" section, under the JSON button:

```svelte
					<p class="text-muted-foreground text-xs">
						El archivo se lee con cualquier editor de texto: no tiene contraseña. Lleva todas tus
						notas, <span class="text-foreground">incluidas las que borraste</span> — así restaurar te
						las puede devolver. Quien lo reciba puede leer todo.
					</p>
```

- [x] **Step 2: The e2e assertion**

In the e2e file that opens the dialog:

```javascript
	await expect(page.getByText('no tiene contraseña')).toBeVisible();
```

Run: `pnpm test:e2e <that file>`
Expected: PASS.

- [x] **Step 3: The checklist in AGENT.md**

Add a section near the sync/backup rules. Copy the table from spec 040's "Why it happens" verbatim — five rows, each naming what breaks if forgotten — under a heading that a new pipe's author cannot walk past:

```markdown
## Un caño de sincronización nuevo le debe cinco cosas al respaldo

Cada caño nuevo (nube cifrada, compartir, y lo que venga) agrega campos a las
filas y estado a las preferencias. El respaldo tiene cinco listas que hay que
tocar, y olvidarse de una no rompe nada hasta que alguien necesita su respaldo.
El caño 1 acertó las cuatro que existían; el caño 2 acertó tres de cinco, y los
dos errores los encontró una persona a mano, semanas después.

| lista | si se la olvida |
|---|---|
| ... (las cinco filas de specs/040) |

Dos están mecanizadas: `EXPORTED_FIELDS` (una clave no declarada rompe el test) y
el respaldo mínimo de `schema.test.ts` (un campo obligatorio nuevo rompe el test).
Las otras tres son prosa: leelas.
```

- [x] **Step 4: The guide**

In `docs/guia/11-respaldo.md`, add to the "Exportar" section, in plain Spanish with no jargon: the file is readable with any text editor and has no password; it carries the deleted notes too, which is what lets a restore bring one back; anyone you send it to can read everything. And in the "Importar" section: a backup downloaded with an older version of CopyNotes is completed on the way in and imports normally, with a line saying so — it is never rejected for a missing internal field.

Update `docs/guia-de-uso.md`'s "Última actualización" to 2026-08-16.

- [x] **Step 5: The changelog**

Add to the in-progress version section of `CHANGELOG.md`, one bullet per visible change, in Spanish with no jargon:

```markdown
- Los respaldos bajados con versiones anteriores de CopyNotes se importan siempre: si al archivo le falta algún dato interno, se completa al entrar en vez de rechazar el archivo entero.
- Al bajar un respaldo, CopyNotes lo revisa antes de decir que está listo.
- Si un archivo está dañado, ahora te dice en castellano qué pasa y cuántos renglones están mal, en lugar de mostrar un error técnico.
- La ventana de Respaldo aclara que el archivo se lee con cualquier editor de texto y que incluye las notas borradas.
```

- [x] **Step 6: Full verification and commit**

```bash
pnpm test && pnpm check && pnpm test:e2e
git add -A
git commit -m "docs(respaldo): el archivo dice que es legible, y AGENT.md le pide cinco cosas a cada caño nuevo"
```

---

## Manual gate (the only test that proves the point)

Runs in the same sitting as the pending 039/038 gate, on the packaged app, so one rebuild serves all three:

- [ ] Rebuild the .app (`copynotes-packaging-the-app`: the four commands in order, `--bundles app`)
- [ ] Hernán quits with **Cmd+Q** first — `open` on a running app only brings the old process forward (`ps -eo pid,lstart,command | grep "CopyNotes.app/Contents/MacOS"` to confirm which build is running)
- [ ] Import **the real file that failed on 2026-08-15**. Expected: it enters, with the "versión anterior" line. This is acceptance criterion 1 against real data.
- [ ] Export a fresh backup and re-import it over the same notes. Expected: nothing added, everything skipped, no duplicates.
- [ ] Then continue with 039's gate and 038's step 5, already written in their own plans.

## Resultado del gate manual — 2026-08-16

Corrido en la .app empaquetada (bundle 14:02), con la reparación v12 ya aplicada al
abrir.

**Pasado, y destapó un bug real que estaba escondido detrás del primero.**

- El archivo que falló el 15 (`copynotes-backup-2026-08-15-2253.json`) **entra**:
  "es un respaldo válido de CopyNotes" + la línea "este archivo venía de una versión
  anterior de CopyNotes y se completó al importarlo". Antes: cartel rojo con
  `data.blocks.718.collapsed`. Criterio 1 probado con datos reales.
- *Reemplazar todo…* aparece (criterio 7: `complete` ausente = completo).
- **Pero el resumen decía "1164 elementos cambiaron en los dos lados"**, cuando la
  predicción era 3. No era ruido: reproducido en el código real con dos de sus
  archivos, **1154 conflictos y 1147 bloques duplicados**.
- Causa medida, y NO era el relleno (que es dirigido por los reclamos del validador
  y no toca campos opcionales): la app fue ganando campos opcionales con el tiempo,
  así que una fila vieja no tiene `dueDate` y la de hoy la tiene en `null`.
  `identical()` comparaba filas enteras. Diferencias medidas entre los dos archivos:
  `createdBy` 1127, `dueDate` 1020, `codeCollapsed` 190, `note` 59, `agentVisible`
  18.
- Arreglado en `identical()` (ver spec 040, "Filling, not relaxing"): un campo
  ausente contra su valor de nacimiento no es un desacuerdo; cualquier otra
  diferencia sí, y una fecha que falta tampoco se perdona. **Re-medido con los mismos
  dos archivos: 1154 → 11**, y los 11 son renglones que Hernán editó de verdad entre
  un respaldo y el otro.
- Unit 1122 verdes, `pnpm check` en sus 4 errores preexistentes.

Lo que **no** se hizo a propósito: no se importó el archivo sobre sus notas reales.
La validación corre antes de escribir, así que ver el resumen y cancelar prueba lo
mismo sin tocarle la base.

## Self-review notes

- **Spec coverage:** rule 1 → Task 2; rule 2 → Task 2 (the third test is the measurement); rule 3 → Task 3; rule 4 → Task 4; rule 5 → Task 7 step 3; rule 6 → Task 5; rule 7 → Task 6 + Task 7. `deletedAt` from "Model of data affected" → Task 1. The v13 question is answered in Global Constraints by measurement, so no task carries it.
- **Type consistency:** `missingShapeFields(table, row, timestamp)` is used with the same three arguments in Tasks 1, 2 and 3. `validateBackup` gains `details` on every return path (Task 6) — the dialog reads `errors[0]` and is unaffected.
- **The two guards must each be seen red** (Task 3 step 3, Task 4 step 4). Neither is optional; a guard that has never failed proves nothing.
