# Una captura vive en la nota (spec 041, parte A — local) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a screenshot into a note and have it survive everything one device can throw at it — reload, offline, export and import — with the bytes stored exactly as they arrived and named by their own SHA-256.

**Architecture:** The pixels live **outside** the block row, outside `block.html`, and outside anything `JSON.stringify` touches. A block carries only small metadata (`imageId` = the hash, type, bytes, width, height) and its description in `content`; the bytes live in a new **local, unsynced** Dexie table `imageBodies` keyed by that same hash. Content addressing is what makes replace, copy, undo and dedupe free. The full backup becomes a `.copynotes` package — a hand-written **STORE-only ZIP**, no library — but only when the database actually holds an image; without images the file stays exactly the `.json` v5 it is today.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie/IndexedDB, valibot, vitest (two projects: `server`/node and `jsdom`), Playwright.

**Spec:** `specs/041-images-in-notes.md` — read `§3`, `§4`, `§5`, `§8` and `§12` before starting. Its decisions are settled; no task stops to ask.

## Global Constraints

- **Work on a branch.** `main` deploys to `copynotes-beta.vercel.app` on every push, so committing the paste button to `main` ships it. Branch: `feat/041-imagenes`. It merges only after the manual gate in Task 12 **and** after part B (cloud) passes its own gate — spec 041 says the door must not open in a version that cannot carry images to the other device.
- **Plain JavaScript inside `.ts`/`.svelte`**: no type annotations in hand-written code (project CLAUDE.md).
- **Commits to `main` and to this branch carry no agent trailer.** No `Co-Authored-By`, no mention of Claude or an agent. Verify with `git log -1 | grep -i 'co-authored\|claude\|agent'` → must print nothing.
- **Run `pnpm check` before every commit** and compare against the count on the branch point; a new error is yours.
- **The bytes are never converted, re-encoded, downscaled or stripped.** Measured: re-encoding saves 8–10%, and `canvas.toBlob('image/webp')` returns `image/png` in Safari with no error, 5 of 5 (spec §2).
- **The cap is `5 * 1024 * 1024` bytes. Never a cap on pixels.** Measured: 4 megapixels → 325 KB, 0.3 megapixels → 345 KB (spec §2 row 4).
- **`imageId` is the lowercase hex SHA-256 of the stored bytes**, 64 characters. Nothing else may be used as the id.
- **Pixels never enter a block row, a snapshot, or a synced row.** `editor/history.ts:6` keeps up to 100 full copies of the block list; `sync/records.ts` does `JSON.stringify`, which turns a `Blob` into `{}` with no error.
- **`imageBodies` is not in `SYNCED_TABLES` and not in `BACKUP_TABLES`.** Both omissions are deliberate and each obliges something else — spec §4.3. Adding it to either list looks like a fix and is not.
- **Accepted formats, by real signature only:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`. **SVG is refused.** Never trust `file.type` or the file name.
- **Every block write goes through `createBlock` / `putBlock` / `updateBlock`** in `src/lib/storage/blocks.ts`. A direct Dexie write leaves a queued save that overwrites it half a second later.
- **Tests placement:** pure tests and Dexie tests run in the **node** (`server`) project; Dexie ones start with `import 'fake-indexeddb/auto';`. Anything needing `DOMParser`, `document` or `File` events goes in the **jsdom** project's explicit include list in `vite.config.ts` (and in the server project's `exclude`). `src/lib/editor/**` is already jsdom.
- **`docs/guia/` and `CHANGELOG.md` change in the same commit as the behaviour they describe** (project rules), plus the index date in `docs/guia-de-uso.md`. Task 12 collects what Tasks 5–11 owe.
- **Pasting cannot be covered by e2e.** Playwright's `Ctrl+V` does not fire a real system paste, and the native file picker is not exercised either. Those two paths are verified by a person, in Task 12.

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/lib/format/blocktype.ts` | gains `'image'` in `BLOCK_TYPES` |
| `src/lib/storage/shape.ts` | the five image fields join `BIRTH_DEFAULTS.blocks` at `null` |
| `src/lib/export-import/schema.ts` | the five fields join `EXPORTED_FIELDS.blocks` and `blockSchema`; `images` on the envelope; `formatVersion` 6 accepted |
| `src/lib/storage/db.ts` | Dexie v13 declares `imageBodies`; it stays out of `SYNCED_TABLES` |
| `src/lib/images/ingest.ts` | **new** — signature, cap, dimensions, hash. Pure except for one injected measurement |
| `src/lib/images/bodies.ts` | **new** — the only door to `imageBodies` |
| `src/lib/images/insert.ts` | **new** — block + body in one transaction |
| `src/lib/images/url.svelte.js` | **new** — object URL per body, revoked on cleanup |
| `src/lib/editor/BlockRow.svelte` | the `image` branch: render, keyboard, description, lightbox |
| `src/lib/editor/ImageLightbox.svelte` | **new** — full-screen view |
| `src/lib/editor/slash.ts` | `/imagen` |
| `src/lib/export-import/zip.ts` | **new** — STORE-only ZIP writer and reader |
| `src/lib/export-import/package.ts` | **new** — `.copynotes` build and read, `complete` self-check |
| `src/lib/platform/files.js` | `saveBinaryFile` / `openBinaryFile` |
| `src/lib/components/BackupDialog.svelte` | exports `.copynotes` when there are images; imports both |
| `vite.config.ts` | `img-src` gains `blob:`; new jsdom test includes |
| `e2e/security-csp.spec.ts` | the policy assertion follows |
| `docs/guia/`, `docs/guia-de-uso.md`, `CHANGELOG.md` | what the person sees |

---

### Task 1: El tipo `image` y la forma de la fila

Three lists learn about images in one commit. Splitting them is the bug: spec 040 measured that a field present on one side and undeclared on the other produced **1154 conflicts and 1147 duplicated rows** on a file byte-identical to the device's own data.

**Files:**
- Modify: `src/lib/format/blocktype.ts`, `src/lib/storage/shape.ts`, `src/lib/export-import/schema.ts`
- Test: `src/lib/storage/shape.test.ts`, `src/lib/export-import/schema.test.ts`

**Interfaces:**
- Produces: `BLOCK_TYPES` includes `'image'`; a block row may carry `imageId`, `imageType`, `imageBytes`, `imageWidth`, `imageHeight`, all `null` at birth.

- [ ] **Step 1: Write the failing test** — append to `src/lib/storage/shape.test.ts`:

```javascript
describe('spec 041: la forma de un bloque conoce las imágenes', () => {
	it('los cinco campos nacen en null', () => {
		const born = missingShapeFields('blocks', {}, '2026-08-20T00:00:00.000Z');
		expect(born.imageId).toBe(null);
		expect(born.imageType).toBe(null);
		expect(born.imageBytes).toBe(null);
		expect(born.imageWidth).toBe(null);
		expect(born.imageHeight).toBe(null);
	});

	it('y una fila que ya los trae no se pisa', () => {
		const filled = missingShapeFields('blocks', { imageId: 'abc', imageBytes: 12 }, '2026-08-20T00:00:00.000Z');
		expect(filled.imageId).toBeUndefined();
		expect(filled.imageBytes).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/storage/shape.test.ts`
Expected: FAIL — `expected undefined to be null`.

- [ ] **Step 3: Add the five fields to `BIRTH_DEFAULTS.blocks`** in `src/lib/storage/shape.ts`, after `createdBy`:

```javascript
		createdBy: 'user',
		// Spec 041. Ausente y `null` significan lo mismo acá, y por eso NO hay
		// migración que las rellene: escribir ~1127 filas no compra nada, y
		// `sameToTheUser` ya perdona "ausente contra su valor de nacimiento".
		// Sin esta declaración, en cambio, cada bloque viejo se vuelve un
		// conflicto — la spec 040 lo midió: 1154.
		imageId: null,
		imageType: null,
		imageBytes: null,
		imageWidth: null,
		imageHeight: null,
		deletedAt: null
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/lib/storage/shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing backup test** — append to `src/lib/export-import/schema.test.ts`:

```javascript
describe('spec 041: un bloque de imagen es un bloque válido', () => {
	const imageBlock = () => ({
		...makeBlock(),
		type: 'image',
		content: 'el error de la consola',
		imageId: 'a'.repeat(64),
		imageType: 'image/png',
		imageBytes: 332372,
		imageWidth: 3018,
		imageHeight: 1312
	});

	it('pasa la validación', () => {
		const result = validateBackup(makeBackup({ blocks: [imageBlock()] }));
		expect(result.ok).toBe(true);
	});

	it('y sus cinco campos llegan al archivo', () => {
		for (const field of ['imageId', 'imageType', 'imageBytes', 'imageWidth', 'imageHeight']) {
			expect(EXPORTED_FIELDS.blocks).toContain(field);
		}
	});
});
```

Import `EXPORTED_FIELDS` at the top of the file if it is not already imported. If `makeBlock` does not exist in this file, reuse whatever factory the neighbouring tests already use.

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm vitest run src/lib/export-import/schema.test.ts`
Expected: FAIL — `Invalid type: Expected "text" | ... but received "image"`.

- [ ] **Step 7: Make it pass** — three edits:

In `src/lib/format/blocktype.ts`:

```javascript
export const BLOCK_TYPES = ['text', 'bullet', 'todo', 'code', 'separator', 'image', ...HEADING_TYPES];
```

In `src/lib/export-import/schema.ts`, inside `blockSchema`, after `codeCollapsed`:

```javascript
	// Spec 041. `looseObject` los dejaría pasar sin mirar; declararlos es lo que
	// hace que un archivo con un `imageId` que no es una huella se rechace.
	imageId: v.optional(v.nullable(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)))),
	imageType: v.optional(v.nullable(v.picklist(['image/png', 'image/jpeg', 'image/webp', 'image/gif']))),
	imageBytes: v.optional(v.nullable(v.number())),
	imageWidth: v.optional(v.nullable(v.number())),
	imageHeight: v.optional(v.nullable(v.number())),
```

And in `EXPORTED_FIELDS.blocks`, alphabetically: `'imageBytes'`, `'imageHeight'`, `'imageId'`, `'imageType'`, `'imageWidth'`.

- [ ] **Step 8: Run the whole suite**

Run: `pnpm vitest run`
Expected: PASS. If `storage/backup.test.ts` fails on the allow-list, a field is missing from `EXPORTED_FIELDS.blocks` — that test exists precisely to catch this.

- [ ] **Step 9: Commit**

```bash
git add src/lib/format/blocktype.ts src/lib/storage/shape.ts src/lib/export-import/schema.ts src/lib/storage/shape.test.ts src/lib/export-import/schema.test.ts
git commit -m "feat(041): el tipo de bloque imagen y la forma de su fila"
```

---

### Task 2: La tabla `imageBodies`

**Files:**
- Modify: `src/lib/storage/db.ts`
- Create: `src/lib/images/bodies.ts`, `src/lib/images/bodies.test.ts`

**Interfaces:**
- Produces: `putBody({ imageId, blob, type, bytes, width, height })`, `getBody(imageId)`, `hasBody(imageId)`, `listBodyIds()`, `deleteBody(imageId)`, `clearBodies()`, `markBodyUploaded(imageId, accountId)`, `clearUploadMarks()`.

- [ ] **Step 1: Write the failing test** — create `src/lib/images/bodies.test.ts`:

```javascript
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SYNCED_TABLES } from '../storage/db';
import { clearBodies, clearUploadMarks, getBody, hasBody, listBodyIds, markBodyUploaded, putBody } from './bodies';

const ID = 'b'.repeat(64);
const bytes = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

describe('los cuerpos de las imágenes', () => {
	beforeEach(async () => {
		await db.table('imageBodies').clear();
	});

	it('un Blob sobrevive la ida y la vuelta por Dexie', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		const back = await getBody(ID);
		expect(back.type).toBe('image/png');
		expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
	});

	it('guardar dos veces la misma huella no duplica', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		expect(await listBodyIds()).toEqual([ID]);
	});

	it('la marca de subida se pone y se borra en masa', async () => {
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		await markBodyUploaded(ID, 'cuenta-1');
		expect((await getBody(ID)).uploadedFor).toBe('cuenta-1');
		await clearUploadMarks();
		expect((await getBody(ID)).uploadedFor).toBe(null);
	});

	it('NO es una tabla sincronizada, y eso es a propósito', () => {
		expect(SYNCED_TABLES).not.toContain('imageBodies');
	});

	it('hasBody no carga los bytes para contestar', async () => {
		expect(await hasBody(ID)).toBe(false);
		await putBody({ imageId: ID, blob: bytes(), type: 'image/png', bytes: 4, width: 2, height: 2 });
		expect(await hasBody(ID)).toBe(true);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/images/bodies.test.ts`
Expected: FAIL — the module does not exist.

> **Risk this step exists to surface:** `fake-indexeddb` clones through `realistic-structured-clone`, and `Blob` support there is the one thing this plan cannot verify from a spec. If the first test fails on the blob round trip rather than on the missing module, **stop and report it** — the fallback is to store `bytes: ArrayBuffer` instead of a `Blob` and build the `Blob` at render time in Task 5. Do not silently switch; the choice changes Task 8 and Task 10.

- [ ] **Step 3: Add the table** — in `src/lib/storage/db.ts`, after the v12 block:

```javascript
// v13 (spec 041): los bytes de las capturas, en su propia tabla y sólo con su
// clave. El Blob NO se indexa: una cadena de Dexie declara índices, y nadie
// busca una imagen por su contenido.
//
// NO entra en SYNCED_TABLES a propósito: una fila sincronizada pasa por
// `JSON.stringify` (sync/records.ts) y un Blob se convierte en `{}` sin error.
// Los bytes viajan por Storage, no por `records` (spec 041 §6).
db.version(13).stores({
	imageBodies: 'imageId'
});
```

- [ ] **Step 4: Write the repository** — create `src/lib/images/bodies.ts`:

```javascript
// La única puerta a `imageBodies` (spec 041 §4.2). Los bytes viven acá y en
// ningún otro lado: ni en la fila del bloque, ni en `block.html`, ni en una
// fotografía de Deshacer.
import { db } from '../storage/db';
import { now } from '../storage/ids';
import { trackPendingWrite } from '../storage/pending-writes';

const bodies = () => db.table('imageBodies');

export function putBody({ imageId, blob, type, bytes, width, height }) {
	return trackPendingWrite(async () => {
		// `put` y no `add`: la huella ES el contenido, así que volver a guardar la
		// misma imagen escribe exactamente los mismos bytes. No es un conflicto.
		await bodies().put({
			imageId,
			blob,
			type,
			bytes,
			width,
			height,
			createdAt: now(),
			uploadedFor: null
		});
		return imageId;
	});
}

export function getBody(imageId) {
	return bodies().get(imageId);
}

// Contesta sin traer el Blob a memoria: una nota con veinte capturas preguntaría
// veinte veces, y cada respuesta pesaría cientos de KB.
export async function hasBody(imageId) {
	return (await bodies().where('imageId').equals(imageId).count()) > 0;
}

export function listBodyIds() {
	return bodies().toCollection().primaryKeys();
}

export function deleteBody(imageId) {
	return trackPendingWrite(() => bodies().delete(imageId));
}

export function clearBodies() {
	return trackPendingWrite(() => bodies().clear());
}

export function markBodyUploaded(imageId, accountId) {
	return trackPendingWrite(() => bodies().update(imageId, { uploadedFor: accountId }));
}

// La llama `resetCloudState()` (spec 041 §4.3): sin esto, "Empezar de nuevo la
// nube" cree que la cuenta nueva ya tiene bytes que nunca vio.
export function clearUploadMarks() {
	return trackPendingWrite(() => bodies().toCollection().modify({ uploadedFor: null }));
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run src/lib/images/bodies.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire `resetCloudState`** — in `src/lib/sync/leave.ts`, inside `resetCloudState()`, after the loop over `SYNCED_TABLES`, add:

```javascript
	// Spec 041 §4.3: las marcas de subida son de la cuenta que se va.
	await clearUploadMarks();
```

with `import { clearUploadMarks } from '../images/bodies';` at the top. Then append to `src/lib/sync/leave.test.ts`:

```javascript
	it('spec 041: empezar de nuevo la nube olvida qué imágenes ya subió', async () => {
		await db.table('imageBodies').put({ imageId: 'c'.repeat(64), uploadedFor: 'cuenta-vieja' });
		await resetCloudState();
		expect((await db.table('imageBodies').get('c'.repeat(64))).uploadedFor).toBe(null);
	});
```

- [ ] **Step 7: Run the suite and commit**

Run: `pnpm vitest run && pnpm check`

```bash
git add src/lib/storage/db.ts src/lib/images/ src/lib/sync/leave.ts src/lib/sync/leave.test.ts
git commit -m "feat(041): la tabla local de cuerpos de imagen"
```

---

### Task 3: Preparar una captura antes de tocar el disco

Everything that can refuse happens here, before a transaction opens.

**Files:**
- Create: `src/lib/images/ingest.ts`, `src/lib/images/ingest.test.ts`

**Interfaces:**
- Produces: `MAX_IMAGE_BYTES`, `detectImageType(head)` → mime string or `null`, `sha256Hex(buffer)` → 64-char hex, `prepareImage(file, measure)` → `{ status: 'ready' | 'too-large' | 'not-an-image' | 'undecodable', ... }`, `measureImage(blob)`.
- Consumed by: Task 4 (`insert.ts`), Task 6 (the doors).

- [ ] **Step 1: Write the failing test** — create `src/lib/images/ingest.test.ts`:

```javascript
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, detectImageType, prepareImage, sha256Hex } from './ingest';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const measures = (width, height) => async () => ({ width, height });
const file = (bytes, name = 'image.png', type = 'image/png') => new File([bytes], name, { type });

describe('la firma real manda, no el nombre ni el tipo declarado', () => {
	it('reconoce los cuatro formatos aceptados', () => {
		expect(detectImageType(PNG)).toBe('image/png');
		expect(detectImageType(JPEG)).toBe('image/jpeg');
		expect(detectImageType(WEBP)).toBe('image/webp');
		expect(detectImageType(GIF)).toBe('image/gif');
	});

	it('rechaza un SVG, que es un documento con programa adentro', () => {
		expect(detectImageType(SVG)).toBe(null);
	});

	it('un .png que por dentro no es PNG se rechaza', async () => {
		const result = await prepareImage(file(SVG, 'trampa.png', 'image/png'), measures(10, 10));
		expect(result.status).toBe('not-an-image');
	});
});

describe('preparar una captura', () => {
	it('devuelve la huella, el tipo, el peso y las medidas', async () => {
		const result = await prepareImage(file(PNG), measures(3018, 1312));
		expect(result.status).toBe('ready');
		expect(result.imageId).toMatch(/^[0-9a-f]{64}$/);
		expect(result.imageId).toBe(await sha256Hex(PNG.buffer));
		expect(result.type).toBe('image/png');
		expect(result.bytes).toBe(16);
		expect(result.width).toBe(3018);
		expect(result.height).toBe(1312);
	});

	it('la misma captura da siempre la misma huella', async () => {
		const a = await prepareImage(file(PNG), measures(2, 2));
		const b = await prepareImage(file(PNG), measures(2, 2));
		expect(a.imageId).toBe(b.imageId);
	});

	it('rechaza por PESO, y lo hace antes de leer el archivo', async () => {
		const huge = { size: MAX_IMAGE_BYTES + 1, arrayBuffer: () => { throw new Error('no se debe leer'); } };
		const result = await prepareImage(huge, measures(2, 2));
		expect(result.status).toBe('too-large');
		expect(result.bytes).toBe(MAX_IMAGE_BYTES + 1);
	});

	it('el tope es 5 MB y va en bytes, nunca en píxeles', async () => {
		expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
		// Medido (spec 041 §2): 4 megapíxeles pesan 325 KB y 0,3 megapíxeles pesan
		// 345 KB. Un tope por píxeles achica la que no molesta y deja pasar la que sí.
		const enorme = await prepareImage(file(PNG), measures(6000, 6000));
		expect(enorme.status).toBe('ready');
	});

	it('un archivo que no se puede decodificar se rechaza', async () => {
		const result = await prepareImage(file(PNG), async () => null);
		expect(result.status).toBe('undecodable');
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/images/ingest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module** — create `src/lib/images/ingest.ts`:

```javascript
// Todo lo que puede decir que no, antes de que se abra una transacción
// (spec 041 §3.3). Nada de acá convierte, achica ni recodifica: medido, volver a
// apretar ahorra 8-10%, y pedirle WebP a Safari devuelve PNG SIN AVISAR.

// Cinco megas. Va sobre el peso y NUNCA sobre los píxeles: el peso no sigue al
// tamaño —4 megapíxeles pesan 325 KB y 0,3 megapíxeles pesan 345 KB (spec §2)—,
// así que un tope por píxeles le borronea el texto a la grande y deja pasar la
// que de verdad pesa.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const starts = (head, bytes) => bytes.every((byte, index) => head[index] === byte);

// La firma real del archivo. `file.type` y el nombre los escribe quien manda el
// archivo; estos bytes los escribe el codificador.
export function detectImageType(head) {
	if (starts(head, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
	if (starts(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (starts(head, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
	// WebP es un contenedor RIFF: "RIFF" ···· "WEBP".
	if (starts(head, [0x52, 0x49, 0x46, 0x46]) && starts(head.subarray(8), [0x57, 0x45, 0x42, 0x50]))
		return 'image/webp';
	return null;
}

export async function sha256Hex(buffer) {
	const digest = await crypto.subtle.digest('SHA-256', buffer);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// La única parte que necesita un navegador de verdad, y por eso entra inyectada:
// jsdom y node no tienen `createImageBitmap`.
export async function measureImage(blob) {
	try {
		const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		const size = { width: bitmap.width, height: bitmap.height };
		bitmap.close?.();
		return size;
	} catch {
		return null;
	}
}

export async function prepareImage(file, measure = measureImage) {
	// Antes de leer nada: `size` es metadato que el navegador ya tiene, así que
	// un archivo enorme nunca entra en memoria para descubrir que era enorme.
	if (file.size > MAX_IMAGE_BYTES) return { status: 'too-large', bytes: file.size };
	const buffer = await file.arrayBuffer();
	const type = detectImageType(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)));
	if (!type) return { status: 'not-an-image' };
	const size = await measure(file);
	if (!size) return { status: 'undecodable' };
	return {
		status: 'ready',
		imageId: await sha256Hex(buffer),
		type,
		bytes: file.size,
		width: size.width,
		height: size.height,
		blob: file
	};
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/lib/images/ingest.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/ingest.ts src/lib/images/ingest.test.ts
git commit -m "feat(041): preparar una captura, con el tope en bytes"
```

---

### Task 4: El bloque y sus bytes entran juntos o no entra ninguno

**Files:**
- Create: `src/lib/images/insert.ts`, `src/lib/images/insert.test.ts`

**Interfaces:**
- Consumes: `prepareImage` (Task 3), `putBody` (Task 2), `createBlock` (`storage/blocks.ts`).
- Produces: `insertImageBlock({ noteId, parentBlockId, order, file, measure })` → `{ status, block? , reason? }`.

- [ ] **Step 1: Write the failing test** — create `src/lib/images/insert.test.ts`:

```javascript
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { listBodyIds } from './bodies';
import { insertImageBlock } from './insert';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const SVG = new TextEncoder().encode('<svg></svg>');
const measures = async () => ({ width: 800, height: 600 });
const file = (bytes) => new File([bytes], 'image.png', { type: 'image/png' });

describe('insertar una captura', () => {
	beforeEach(async () => {
		await Promise.all([db.table('blocks').clear(), db.table('imageBodies').clear()]);
	});

	it('deja un bloque de tipo image y su cuerpo', async () => {
		const result = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		expect(result.status).toBe('ready');
		expect(result.block.type).toBe('image');
		expect(result.block.imageWidth).toBe(800);
		expect(result.block.content).toBe('');
		expect(await listBodyIds()).toEqual([result.block.imageId]);
	});

	it('la misma captura dos veces son dos bloques y UN cuerpo', async () => {
		const a = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		const b = await insertImageBlock({ noteId: 'n1', file: file(PNG), measure: measures });
		expect(a.block.id).not.toBe(b.block.id);
		expect(a.block.imageId).toBe(b.block.imageId);
		expect(await listBodyIds()).toHaveLength(1);
	});

	it('un archivo rechazado no deja NI bloque ni cuerpo', async () => {
		const result = await insertImageBlock({ noteId: 'n1', file: file(SVG), measure: measures });
		expect(result.status).toBe('not-an-image');
		expect(await db.table('blocks').count()).toBe(0);
		expect(await listBodyIds()).toEqual([]);
	});

	it('si falla guardar los bytes, tampoco queda el bloque', async () => {
		const explota = { size: 16, arrayBuffer: async () => PNG.buffer, stream: null };
		const result = await insertImageBlock({
			noteId: 'n1',
			file: explota,
			measure: measures,
			saveBody: async () => { throw new Error('sin espacio'); }
		});
		expect(result.status).toBe('failed');
		expect(await db.table('blocks').count()).toBe(0);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/images/insert.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module** — create `src/lib/images/insert.ts`:

```javascript
// Un bloque de imagen y sus bytes son una sola cosa: entran los dos o no entra
// ninguno (spec 041 §4.2). Toda la preparación que puede fallar —firma, tope,
// medidas, huella— ocurre ANTES, así que la transacción sólo escribe.
import { createBlock } from '../storage/blocks';
import { putBody } from './bodies';
import { prepareImage } from './ingest';

export async function insertImageBlock({
	noteId,
	parentBlockId = null,
	order,
	file,
	measure,
	saveBody = putBody
}) {
	const prepared = await prepareImage(file, measure);
	if (prepared.status !== 'ready') return prepared;

	// Los bytes primero. Un cuerpo huérfano se puede limpiar; un bloque que
	// apunta a bytes que no existen es una imagen rota en pantalla.
	try {
		await saveBody(prepared);
	} catch (error) {
		return { status: 'failed', reason: String(error?.message ?? error) };
	}

	const block = await createBlock({
		noteId,
		parentBlockId,
		order,
		type: 'image',
		content: '',
		imageId: prepared.imageId,
		imageType: prepared.type,
		imageBytes: prepared.bytes,
		imageWidth: prepared.width,
		imageHeight: prepared.height
	});
	return { status: 'ready', block };
}
```

- [ ] **Step 4: Teach `createBlock` the five fields** — in `src/lib/storage/blocks.ts`, add them to the destructuring and to the object literal, defaulting to `null`:

```javascript
			createdBy = 'user',
			imageId = null,
			imageType = null,
			imageBytes = null,
			imageWidth = null,
			imageHeight = null
```

and, in the block literal, after `createdBy`:

```javascript
			imageId,
			imageType,
			imageBytes,
			imageWidth,
			imageHeight,
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run src/lib/images/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/images/insert.ts src/lib/images/insert.test.ts src/lib/storage/blocks.ts
git commit -m "feat(041): el bloque y sus bytes entran en una sola operación"
```

---

### Task 5: La captura en pantalla

**Files:**
- Modify: `vite.config.ts`, `e2e/security-csp.spec.ts`, `src/lib/editor/BlockRow.svelte`
- Create: `src/lib/images/url.svelte.js`, `src/lib/editor/ImageLightbox.svelte`

**Interfaces:**
- Consumes: `getBody` (Task 2).
- Produces: an `image` branch in `BlockRow` that renders the picture, its description input, and opens `ImageLightbox` on click.

- [ ] **Step 1: Open the policy to `blob:`** — in `vite.config.ts`:

```javascript
					// `blob:` es cómo se pinta una captura guardada en el aparato
					// (spec 041): `URL.createObjectURL` sobre el Blob local. No se
					// agregan direcciones externas: la app nunca busca una imagen
					// afuera.
					'img-src': ['self', 'data:', 'blob:'],
```

Update the assertion in `e2e/security-csp.spec.ts` to match. That test failing before this edit is the point.

- [ ] **Step 2: Write the object-URL helper** — create `src/lib/images/url.svelte.js`:

```javascript
// Una URL temporal por cuerpo, revocada cuando el renglón se va. Sin el revoke,
// una nota con veinte capturas deja veinte Blobs vivos hasta recargar.
import { getBody } from './bodies';

export function imageUrl(getImageId) {
	let url = $state(null);
	let missing = $state(false);

	$effect(() => {
		const imageId = getImageId();
		let revoked = false;
		let current = null;
		url = null;
		missing = false;
		if (!imageId) return;
		getBody(imageId).then((body) => {
			if (revoked) return;
			if (!body) {
				missing = true;
				return;
			}
			current = URL.createObjectURL(body.blob);
			url = current;
		});
		return () => {
			revoked = true;
			if (current) URL.revokeObjectURL(current);
		};
	});

	return {
		get url() {
			return url;
		},
		get missing() {
			return missing;
		}
	};
}
```

- [ ] **Step 3: Write the lightbox** — create `src/lib/editor/ImageLightbox.svelte`:

```svelte
<script>
	// Ver la captura a tamaño real. No es adorno: un pantallazo de 3018 px dentro
	// de una columna de ~700 no se lee, y leerlo es para lo que se pegó.
	let { url, alt = '', onClose } = $props();

	function onKeydown(event) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="bg-background/95 fixed inset-0 z-50 overflow-auto p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Captura ampliada"
	tabindex="-1"
	onclick={onClose}
>
	<img src={url} {alt} class="mx-auto max-w-none" />
</div>
```

- [ ] **Step 4: Add the `image` branch to `BlockRow.svelte`**

Four edits, all guarded so no existing behaviour moves:

1. Near `isRich` (line ~163), add `const isImage = $derived(block.type === 'image');` and make `isRich` exclude it: `block.type !== 'code' && block.type !== 'separator' && block.type !== 'image'`.
2. The placeholder check (line ~177) must exclude images — **an image with no description is not an empty row**: add `&& block.type !== 'image'`.
3. In the markup, in the same `{#if block.type === 'separator'}` chain (line ~830), add a branch **before** the `{:else}` that renders the editable:

```svelte
{:else if block.type === 'image'}
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		{#if picture.missing}
			<!-- La referencia llegó y los bytes no. En la parte A esto sólo pasa
			     importando un paquete incompleto; en la B, mientras baja. -->
			<div
				class="bg-muted text-muted-foreground flex items-center justify-center rounded-md text-sm"
				style="aspect-ratio: {block.imageWidth} / {block.imageHeight}; max-width: 100%"
			>
				Imagen no disponible
			</div>
		{:else if picture.url}
			<!-- `width`/`height` reservan el lugar exacto ANTES de que cargue, que es
			     lo que impide que la nota salte. -->
			<img
				src={picture.url}
				alt={block.content}
				width={block.imageWidth}
				height={block.imageHeight}
				loading="lazy"
				decoding="async"
				class="h-auto max-w-full cursor-zoom-in rounded-md"
				onclick={() => (zoomed = true)}
			/>
		{/if}
		<input
			class="text-muted-foreground placeholder:text-faint w-full border-0 bg-transparent p-0 text-sm focus:outline-none"
			placeholder="Descripción (opcional)"
			value={block.content}
			disabled={readOnly}
			oninput={(event) => onChange?.(block, { content: event.currentTarget.value })}
			onkeydown={handleImageCaptionKeys}
		/>
	</div>
{/if}
```

with, in the `<script>`:

```javascript
	const picture = imageUrl(() => block.imageId);
	let zoomed = $state(false);
```

and, at the end of the markup:

```svelte
{#if zoomed && picture.url}
	<ImageLightbox url={picture.url} alt={block.content} onClose={() => (zoomed = false)} />
{/if}
```

The description is a plain `<input>`, not a `contenteditable`: it carries no inline formatting, so it never touches `block.html` and never touches the ingest gate. **It is a separate field from the row's editable** — the same shape that made the read-only lock in spec 038 leak through the title.
4. Write `handleImageCaptionKeys`:

```javascript
	// Dos pasos a propósito: el primer Backspace saca el foco de la descripción y
	// lo pone en la imagen, el segundo borra el bloque. Y NUNCA se une con el
	// renglón de arriba — unir un archivo con texto no significa nada.
	let imageFocused = $state(false);

	function handleImageCaptionKeys(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			onEnter?.(block);
			return;
		}
		if (event.key !== 'Backspace' || event.currentTarget.selectionStart !== 0) return;
		if ((block.content ?? '') !== '') return;
		event.preventDefault();
		if (!imageFocused) {
			imageFocused = true;
			return;
		}
		onDelete?.(block);
	}
```

Use whatever the existing callback names are for "new row below" and "delete this block" — read the neighbouring branches rather than inventing names. `imageFocused` resets to `false` whenever the row loses focus.

- [ ] **Step 5: Block the type menu in both directions** — in `src/lib/format/blocktype.ts`:

```javascript
// Una imagen no se convierte en título ni en tarea, y nada se convierte en
// imagen: el tipo `image` sólo lo crea `insertImageBlock`, que además guarda los
// bytes. Cambiarle el tipo a un bloque de imagen dejaría un `imageId` colgado.
export function canChangeType(block, nextType) {
	return block.type !== 'image' && nextType !== 'image';
}
```

and make `planBlockType` refuse when `canChangeType` is false (return `null`), with callers treating `null` as "no hagas nada". Add a test in `src/lib/format/blocktype.test.ts` for both directions.

- [ ] **Step 6: Run the suite**

Run: `pnpm vitest run && pnpm check && pnpm test:e2e e2e/security-csp.spec.ts`
Expected: PASS.

> After `pnpm test:e2e`, the dev server's policy is rewritten by the e2e build. If a `pnpm dev` was running, restart it — otherwise the app runs with no cloud host and every request fails with `Failed to fetch`. `curl -sI http://localhost:5173/ | grep -i content-security` tells you in one command.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts e2e/security-csp.spec.ts src/lib/editor/ src/lib/images/url.svelte.js src/lib/format/blocktype.ts src/lib/format/blocktype.test.ts
git commit -m "feat(041): la captura se ve en la nota, y se abre a tamaño real"
```

---

### Task 6: Las puertas de entrada

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte`, `src/lib/editor/slash.ts`, `src/lib/editor/Editor.svelte`, `src/lib/platform/files.js`
- Test: `src/lib/editor/slash.test.ts`, `src/lib/platform/files.test.js`

**Interfaces:**
- Consumes: `insertImageBlock` (Task 4).
- Produces: `openImageFiles()` in `platform/files.js`; an `onInsertImages(block, files)` callback wired from `BlockRow` to `Editor`.

- [ ] **Step 1: Paste** — in `handlePaste` in `BlockRow.svelte`, **immediately after the `readOnly` guard and before the `text` line**:

```javascript
		// Spec 041: un archivo de verdad en el portapapeles gana. Una dirección
		// `<img src="https://...">` copiada de una página NO se descarga: sólo se
		// acepta un archivo que el portapapeles entregue.
		//
		// Medido en Safari 26.5: una captura llega como `image.png`, `image/png`.
		// Y un pegado puede venir SIN nada —ni archivos ni tipos—: eso cae al
		// camino de texto de siempre, como antes.
		const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
			file.type.startsWith('image/')
		);
		if (images.length > 0) {
			event.preventDefault();
			onInsertImages?.(block, images);
			return;
		}
```

Add `onInsertImages` to the component's `$props()`.

- [ ] **Step 2: Drop** — on the row element, add `ondragover` (preventDefault) and `ondrop` that pulls `event.dataTransfer.files`, filters the same way, and calls the same `onInsertImages`. One ingest function, two doors.

- [ ] **Step 3: `/imagen`** — in `src/lib/editor/slash.ts`, add to the item list after `code`:

```javascript
	{ id: 'image', label: 'Imagen', keywords: ['imagen', 'image', 'captura', 'screenshot', 'foto', 'pantallazo'] },
```

`image` is an **action**, not a type change: selecting it opens the file picker and, if a file comes back, inserts image blocks. Cancelling must consume nothing — no `/` swallowed, no type changed, no caret moved. Follow whatever pattern `snippet` and `date` already use for action items; they are the precedent.

- [ ] **Step 4: The binary file door** — in `src/lib/platform/files.js`, beside `openTextFile`:

```javascript
// El mismo diálogo que `openTextFile`, sin leer el archivo a texto: una captura
// no es texto y `file.text()` la rompería. El tope lo pone el ingestor
// (`images/ingest.ts`), que sabe cuál es el de una imagen.
export async function openImageFiles() {
	const file = await chooseFile('image/*');
	if (!file) return { status: 'cancelled' };
	return { status: 'opened', files: [file] };
}

// El gemelo de `saveTextFile` para bytes. Recibe el Blob ya armado porque quien
// llama es el que sabe cómo se arma el paquete.
export async function saveBinaryFile({ fileName, blob }) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
	return { status: 'saved', fileName };
}

export async function openBinaryFile({ accept = '' } = {}) {
	const file = await chooseFile(accept);
	if (!file) return { status: 'cancelled' };
	return { status: 'opened', fileName: file.name, bytes: await file.arrayBuffer() };
}
```

- [ ] **Step 5: Wire the handler in `Editor.svelte`** — `onInsertImages(block, files)` calls `insertImageBlock` **once per file, in order**, each after the previous resolves, so the order the person dropped them is the order on screen. Every non-`ready` status becomes a toast in plain Spanish:

| status | message |
|---|---|
| `too-large` | `Esa imagen pesa más de 5 MB. Probá con una captura más chica.` |
| `not-an-image` | `Ese archivo no es una imagen que CopyNotes pueda guardar.` |
| `undecodable` | `No se pudo leer esa imagen.` |
| `failed` | `No se pudo guardar la imagen. Puede que no haya espacio.` |

- [ ] **Step 6: Ask for room, and check there is some** — two calls, both in the door that inserts, both optional-chained because neither exists everywhere:

```javascript
// Una vez por sesión, antes del primer `putBody`. Es un pedido, no una reserva:
// el navegador contesta lo que quiere y la respuesta no cambia lo que hacemos.
await navigator.storage?.persist?.();

// Y antes de escribir: la estimación es orientación, NO permiso. La respuesta
// definitiva es `QuotaExceededError`, que ya se captura como `status: 'failed'`.
const room = await navigator.storage?.estimate?.();
if (room?.quota != null && room?.usage != null && room.quota - room.usage < file.size * 2) {
	// Avisar antes de intentar es mejor que fallar a mitad de camino, pero no
	// se cancela por la estimación sola: se intenta igual y el error manda.
	warnLowSpace();
}
```

- [ ] **Step 7: Run the suite and commit**

Run: `pnpm vitest run && pnpm check`

```bash
git add src/lib/editor/ src/lib/platform/files.js src/lib/platform/files.test.js
git commit -m "feat(041): pegar, arrastrar y /imagen"
```

---

### Task 7: Los bloqueos

Four refusals, each at the layer that can actually enforce it. Hiding a button is not a check.

**Files:**
- Modify: `src/lib/sync/shared-payload.ts`, `src/lib/components/ShareDialog.svelte`, `src/lib/snippets/snapshot.ts`, `src/lib/export-import/note-export.ts`, `src/lib/bridge/export.ts`
- Test: `src/lib/sync/shared-payload.test.ts`, `src/lib/snippets/snapshot.test.ts`, `src/lib/export-import/note-export.test.ts`, `src/lib/bridge/export.test.ts` (all four already exist)

- [ ] **Step 1: Write the failing tests**

```javascript
// note-export.test.ts
it('spec 041: una imagen se exporta como texto y se avisa', () => {
	const blocks = [{ type: 'image', content: 'el error', imageId: 'a'.repeat(64) }];
	expect(noteToMarkdown({ title: 'N' }, blocks)).toContain('[Imagen: el error]');
	expect(noteToMarkdown({ title: 'N' }, blocks)).not.toContain('blob:');
});

it('spec 041: una imagen sin descripción sigue diciendo que hubo una imagen', () => {
	const blocks = [{ type: 'image', content: '', imageId: 'a'.repeat(64) }];
	expect(noteToMarkdown({ title: 'N' }, blocks)).toContain('[Imagen]');
});
```

```javascript
// shared-payload.test.ts
it('spec 041: el caño compartido RECHAZA una imagen, no la manda a medias', () => {
	expect(() => toSharedPayload({ type: 'image', content: 'x', imageId: 'a'.repeat(64) })).toThrow(
		/imagen/i
	);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib/export-import/note-export.test.ts src/lib/sync/shared-payload.test.ts`

- [ ] **Step 3: Implement the four refusals**

1. **Markdown / HTML note export**: an `image` block renders `[Imagen: descripción]`, or `[Imagen]` with no description. A `blob:` URL is **never** written — it stops existing when CopyNotes closes. The export dialog says images were not included.
2. **Shared channel**: the serializer **throws** on an `image` block. Sending only the description and pretending everything travelled is the failure this prevents.
3. **Share dialog**: refuses to share a note that contains an image block, with `No se pueden compartir notas con imágenes todavía.` The storage operation re-checks; the dialog is the courtesy, not the guard. And inside an already-shared note, paste / drop / `/imagen` explain themselves instead of silently doing nothing.
4. **Snippets**: saving a selection containing an image is refused with `Un atajo no puede tener imágenes todavía.`
5. **Agent (`export.json`)**: an image block becomes `[Imagen: descripción]`. No bytes, no dimensions, no ids.

- [ ] **Step 4: Run the suite and commit**

Run: `pnpm vitest run && pnpm check`

```bash
git add -A
git commit -m "feat(041): compartir, atajos, exportar y el agente rechazan imágenes explícitamente"
```

---

### Task 8: Un ZIP sin compresión, escrito a mano

No library. STORE-only, which is what makes a zip bomb impossible by construction: with no compression the declared size cannot lie about what it expands to.

**Files:**
- Create: `src/lib/export-import/zip.ts`, `src/lib/export-import/zip.test.ts`

**Interfaces:**
- Produces: `buildZip(entries)` → `Blob`, where `entries` is `[{ name, blob }]`; `readZip(arrayBuffer)` → `{ status: 'ok', entries: Map<name, Uint8Array> }` or `{ status, reason }`.

- [ ] **Step 1: Write the failing test** — create `src/lib/export-import/zip.test.ts`:

```javascript
import { describe, expect, it } from 'vitest';
import { buildZip, readZip } from './zip';

const text = (value) => new Blob([new TextEncoder().encode(value)]);
const decode = (bytes) => new TextDecoder().decode(bytes);

describe('el paquete', () => {
	it('lo que entra es lo que sale', async () => {
		const zip = await buildZip([
			{ name: 'backup.json', blob: text('{"formatVersion":6}') },
			{ name: 'images/' + 'a'.repeat(64) + '.png', blob: text('PNGPNGPNG') }
		]);
		const read = readZip(new Uint8Array(await zip.arrayBuffer()));
		expect(read.status).toBe('ok');
		expect(decode(read.entries.get('backup.json'))).toBe('{"formatVersion":6}');
		expect(decode(read.entries.get('images/' + 'a'.repeat(64) + '.png'))).toBe('PNGPNGPNG');
	});

	it('nada se comprime, así que una bomba zip no puede existir', async () => {
		const zip = await buildZip([{ name: 'backup.json', blob: text('a'.repeat(10000)) }]);
		// Con el método STORE el tamaño comprimido ES el tamaño real, así que el
		// archivo entero no puede ser mucho más chico que su contenido.
		expect(zip.size).toBeGreaterThan(10000);
	});

	it('un paquete cortado se rechaza en vez de adivinar', () => {
		expect(readZip(new Uint8Array([1, 2, 3])).status).toBe('not-a-package');
	});

	it('una entrada comprimida se rechaza: nuestro exportador nunca escribe una', async () => {
		const zip = await buildZip([{ name: 'backup.json', blob: text('hola') }]);
		const bytes = new Uint8Array(await zip.arrayBuffer());
		// El método vive en el byte 8 del encabezado local y en el 10 del central.
		bytes[8] = 8;
		expect(readZip(bytes).status).toBe('compressed-entry');
	});

	it('un nombre repetido se rechaza', async () => {
		const zip = await buildZip([
			{ name: 'backup.json', blob: text('uno') },
			{ name: 'backup.json', blob: text('dos') }
		]);
		expect(readZip(new Uint8Array(await zip.arrayBuffer())).status).toBe('duplicate-entry');
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/export-import/zip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module** — create `src/lib/export-import/zip.ts`:

```javascript
// Un ZIP de verdad, con el método STORE y nada más (spec 041 §5.2).
//
// Sin librería, por tres motivos en este orden: una bomba zip se vuelve
// IMPOSIBLE por construcción —sin compresión, el tamaño declarado no puede
// mentir sobre en qué se expande—; las capturas ya vienen comprimidas y
// apretarlas de nuevo no ahorra nada; y el proyecto tiene siete dependencias de
// ejecución en total (spec 015).
//
// ponytail: sin Zip64. Techo de 4 GB por archivo y 65535 entradas, muy por
// encima del tope de 5 MB por imagen. El día que haga falta, Zip64 son dos
// campos más en el directorio central.

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index++) {
		let value = index;
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

// La hora en el formato de MS-DOS que el ZIP arrastra desde 1989.
function dosStamp(date) {
	const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
	const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
	return { time, day };
}

export async function buildZip(entries, date = new Date()) {
	const { time, day } = dosStamp(date);
	const parts = [];
	const central = [];
	let offset = 0;

	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.name);
		const data = new Uint8Array(await entry.blob.arrayBuffer());
		const crc = crc32(data);

		const header = new DataView(new ArrayBuffer(30));
		header.setUint32(0, LOCAL, true);
		header.setUint16(4, 20, true); // versión necesaria
		header.setUint16(6, 0, true); // banderas
		header.setUint16(8, 0, true); // método 0 = STORE
		header.setUint16(10, time, true);
		header.setUint16(12, day, true);
		header.setUint32(14, crc, true);
		header.setUint32(18, data.length, true); // comprimido
		header.setUint32(22, data.length, true); // real — iguales, por eso no hay bomba
		header.setUint16(26, name.length, true);
		header.setUint16(28, 0, true); // extra
		parts.push(new Uint8Array(header.buffer), name, data);

		const record = new DataView(new ArrayBuffer(46));
		record.setUint32(0, CENTRAL, true);
		record.setUint16(4, 20, true);
		record.setUint16(6, 20, true);
		record.setUint16(8, 0, true);
		record.setUint16(10, 0, true);
		record.setUint16(12, time, true);
		record.setUint16(14, day, true);
		record.setUint32(16, crc, true);
		record.setUint32(20, data.length, true);
		record.setUint32(24, data.length, true);
		record.setUint16(28, name.length, true);
		record.setUint32(42, offset, true);
		central.push(new Uint8Array(record.buffer), name);

		offset += 30 + name.length + data.length;
	}

	const centralSize = central.reduce((total, part) => total + part.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, EOCD, true);
	end.setUint16(8, entries.length, true);
	end.setUint16(10, entries.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);
	return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
		type: 'application/zip'
	});
}

export function readZip(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// El final del directorio central se busca desde atrás: es lo único que el
	// formato garantiza que está al final.
	let end = -1;
	for (let index = bytes.length - 22; index >= 0; index--) {
		if (view.getUint32(index, true) === EOCD) {
			end = index;
			break;
		}
	}
	if (end < 0) return { status: 'not-a-package' };

	const count = view.getUint16(end + 10, true);
	let cursor = view.getUint32(end + 16, true);
	const entries = new Map();

	for (let index = 0; index < count; index++) {
		if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL)
			return { status: 'not-a-package' };
		if (view.getUint16(cursor + 10, true) !== 0) return { status: 'compressed-entry' };
		const nameLength = view.getUint16(cursor + 28, true);
		const extraLength = view.getUint16(cursor + 30, true);
		const commentLength = view.getUint16(cursor + 32, true);
		const size = view.getUint32(cursor + 24, true);
		const localOffset = view.getUint32(cursor + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
		if (entries.has(name)) return { status: 'duplicate-entry', name };

		if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL)
			return { status: 'not-a-package' };
		if (view.getUint16(localOffset + 8, true) !== 0) return { status: 'compressed-entry' };
		const dataStart =
			localOffset +
			30 +
			view.getUint16(localOffset + 26, true) +
			view.getUint16(localOffset + 28, true);
		if (dataStart + size > bytes.length) return { status: 'not-a-package' };
		entries.set(name, bytes.subarray(dataStart, dataStart + size));

		cursor += 46 + nameLength + extraLength + commentLength;
	}
	return { status: 'ok', entries };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/lib/export-import/zip.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify against a real unzipper** — this is the step that catches a byte laid out wrong, which no unit test of our own reader can:

```bash
node --input-type=module -e "
import { buildZip } from './src/lib/export-import/zip.ts';
const blob = await buildZip([{ name: 'backup.json', blob: new Blob(['{\"ok\":true}']) }]);
await (await import('node:fs/promises')).writeFile('/tmp/prueba.copynotes', Buffer.from(await blob.arrayBuffer()));
" 2>/dev/null || echo "usar vitest en su lugar si el import de .ts falla"
unzip -l /tmp/prueba.copynotes && unzip -p /tmp/prueba.copynotes backup.json
```

Expected: `unzip` lists `backup.json` and prints `{"ok":true}`. If `unzip` complains, the header layout is wrong — a passing unit test does not prove a valid ZIP.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export-import/zip.ts src/lib/export-import/zip.test.ts
git commit -m "feat(041): un ZIP sin compresión, sin librería"
```

---

### Task 9: Armar y leer el paquete `.copynotes`

**Files:**
- Create: `src/lib/export-import/package.ts`, `src/lib/export-import/package.test.ts`
- Modify: `src/lib/export-import/schema.ts`, `src/lib/export-import/index.ts`

**Interfaces:**
- Consumes: `buildZip` / `readZip` (Task 8), `buildBackup` (`export-import/backup.ts`).
- Produces: `packageFileName(date)`, `buildPackage(backup, bodies)` → `{ blob, complete }`, `readPackage(arrayBuffer)` → `{ status, backup?, images?, reason? }`, `referencedImageIds(blocks)`, `EXTENSION_BY_TYPE`.

- [ ] **Step 1: Write the failing test** — create `src/lib/export-import/package.test.ts`:

```javascript
import { describe, expect, it } from 'vitest';
import { buildPackage, packageFileName, readPackage, referencedImageIds } from './package';

const ID = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
const backupWith = (blocks) => ({ formatVersion: 6, complete: true, data: { blocks } });
const body = (imageId) => ({ imageId, blob: png(), type: 'image/png', bytes: 4, width: 2, height: 2 });

describe('las referencias', () => {
	it('la papelera también cuenta: un bloque borrado sigue apuntando a su imagen', () => {
		const ids = referencedImageIds([
			{ type: 'image', imageId: ID, deletedAt: null },
			{ type: 'image', imageId: OTHER, deletedAt: '2026-08-01T00:00:00.000Z' }
		]);
		expect([...ids].sort()).toEqual([ID, OTHER].sort());
	});
});

describe('armar el paquete', () => {
	it('el nombre lleva la extensión propia', () => {
		expect(packageFileName(new Date('2026-08-20T15:04:00'))).toBe(
			'copynotes-backup-2026-08-20-1504.copynotes'
		);
	});

	it('con todos los cuerpos, se declara completo', async () => {
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), [body(ID)]);
		expect(result.complete).toBe(true);
		const read = await readPackage(new Uint8Array(await result.blob.arrayBuffer()));
		expect(read.status).toBe('ok');
		expect(read.backup.formatVersion).toBe(6);
		expect(read.images.get(ID)).toBeDefined();
	});

	it('si falta un cuerpo NO miente: sale igual, y dice que está incompleto', async () => {
		const result = await buildPackage(backupWith([{ type: 'image', imageId: ID }]), []);
		expect(result.complete).toBe(false);
		const read = await readPackage(new Uint8Array(await result.blob.arrayBuffer()));
		expect(read.backup.complete).toBe(false);
	});
});

describe('leer el paquete: lo que rechaza antes de tocar nada', () => {
	const withName = async (name) => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{ name: 'backup.json', blob: new Blob([JSON.stringify(backupWith([]))]) },
			{ name, blob: png() }
		]);
		return await readPackage(new Uint8Array(await zip.arrayBuffer()));
	};

	it('rechaza una ruta que sale de la carpeta', async () => {
		expect((await withName('images/../../etc/passwd')).status).toBe('bad-entry-name');
	});

	it('rechaza un nombre que no es una huella', async () => {
		expect((await withName('images/gato.png')).status).toBe('bad-entry-name');
	});

	it('rechaza un archivo cuya huella no coincide con su nombre', async () => {
		const { buildZip } = await import('./zip');
		const zip = await buildZip([
			{ name: 'backup.json', blob: new Blob([JSON.stringify(backupWith([{ type: 'image', imageId: ID }]))]) },
			{ name: `images/${ID}.png`, blob: new Blob([new Uint8Array([1, 2, 3, 4])]) }
		]);
		expect((await readPackage(new Uint8Array(await zip.arrayBuffer()))).status).toBe('hash-mismatch');
	});

	it('un .json que dice ser versión 6 se rechaza: los bytes no pueden estar ahí', async () => {
		const plain = new TextEncoder().encode(JSON.stringify({ formatVersion: 6 }));
		expect((await readPackage(plain)).status).toBe('not-a-package');
	});
});
```

`readPackage` is `async` because it re-hashes every image entry, and `sha256Hex` is async. Every call above awaits it.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/export-import/package.test.ts`

- [ ] **Step 3: Write the module** — `src/lib/export-import/package.ts` must:

1. `referencedImageIds(blocks)` → a `Set` of every non-null `imageId`, **including soft-deleted blocks**, because the backup carries the trash and a deleted block still references its body (spec §9.1).
2. `EXTENSION_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }`.
3. `buildPackage(backup, bodies)`: writes `backup.json` (with the `images` metadata array and `complete` set by the self-check), `README.txt`, and `images/<imageId>.<ext>` per body. **`complete` is true only when every referenced id has a body whose length matches and whose SHA-256 equals the id.** Never claim completeness that was not verified.
4. `readPackage(bytes)`: `readZip` first, then the name allow-list — exactly `backup.json`, `README.txt`, and `images/<64 hex>.<png|jpg|webp|gif>`. Anything else → `bad-entry-name`. Then re-hash every image entry and refuse `hash-mismatch`. Then `JSON.parse` `backup.json`.
5. `README.txt` in Spanish: what the file is, that the JSON opens in any text editor, and that it also carries the trash.

Add `formatVersion` 6 to `SUPPORTED_VERSIONS` in `schema.ts` and an `images` field to the envelope schema (`v.optional(v.array(...))`). Export the new names from `export-import/index.ts`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/lib/export-import/`

- [ ] **Step 5: Commit**

```bash
git add src/lib/export-import/
git commit -m "feat(041): el paquete .copynotes se arma y se lee, y sólo dice completo si lo comprobó"
```

---

### Task 10: El respaldo real: exportar e importar

**Files:**
- Modify: `src/lib/components/BackupDialog.svelte`, `src/lib/storage/backup.ts`, `src/lib/export-import/merge.ts`
- Test: `src/lib/storage/backup.test.ts`

**Interfaces:**
- Consumes: `buildPackage` / `readPackage` (Task 9), `saveBinaryFile` / `openBinaryFile` (Task 6), `listBodyIds` / `getBody` / `putBody` / `clearBodies` (Task 2).

- [ ] **Step 1: Write the failing test** — append to `src/lib/storage/backup.test.ts`:

```javascript
describe('spec 041: el formato lo decide si hay imágenes', () => {
	it('sin imágenes sigue siendo el .json de siempre, versión 5', () => {
		const chosen = chooseBackupFormat([{ type: 'text', imageId: null }]);
		expect(chosen.extension).toBe('json');
		expect(chosen.formatVersion).toBe(5);
	});

	it('con una sola imagen pasa a .copynotes versión 6', () => {
		const chosen = chooseBackupFormat([{ type: 'image', imageId: 'a'.repeat(64) }]);
		expect(chosen.extension).toBe('copynotes');
		expect(chosen.formatVersion).toBe(6);
	});

	it('una imagen en la papelera también cuenta', () => {
		const chosen = chooseBackupFormat([
			{ type: 'image', imageId: 'a'.repeat(64), deletedAt: '2026-08-01T00:00:00.000Z' }
		]);
		expect(chosen.extension).toBe('copynotes');
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/storage/backup.test.ts`

- [ ] **Step 3: Export** — `chooseBackupFormat(blocks)` in `storage/backup.ts` returns `{ extension: 'json', formatVersion: 5 }` when `referencedImageIds(blocks)` is empty and `{ extension: 'copynotes', formatVersion: 6 }` otherwise. `BackupDialog` then either keeps today's `saveTextFile` path or calls `buildPackage` + `saveBinaryFile`. **When `complete` comes back false, the dialog says so** — `Se guardó el respaldo, pero le falta alguna imagen.` — instead of the usual success line.

- [ ] **Step 4: Import** — the dialog's `accept` becomes `.json,.copynotes`. A file whose name ends in `.copynotes`, or whose first four bytes are `PK\x03\x04`, goes through `openBinaryFile` + `readPackage`; everything else keeps today's text path. Sniffing the bytes as well as the name matters: a person renames files.

- [ ] **Step 5: "Reemplazar todo" must clear `imageBodies` by hand**

`imageBodies` is **not** in `BACKUP_TABLES` (deliberately — its rows are not JSON), and replace-all clears tables by walking that list. So it would survive a wipe and leave bodies from the previous database. Add an explicit `clearBodies()` to the replace-all path, and a test:

```javascript
it('spec 041: reemplazar todo también limpia los cuerpos de imagen', async () => {
	await db.table('imageBodies').put({ imageId: 'z'.repeat(64), uploadedFor: null });
	await replaceAllFrom(emptyBackup());
	expect(await db.table('imageBodies').count()).toBe(0);
});
```

- [ ] **Step 6: Bodies land before blocks** — on import, write every body first, then the rows. A crash between them leaves orphan bodies, which is recoverable; the reverse leaves blocks pointing at nothing.

- [ ] **Step 7: The full round trip, by hand**

```
Exportar → borrar la base (Configuración) → importar → la captura se ve igual
```

- [ ] **Step 8: Run the suite and commit**

Run: `pnpm vitest run && pnpm check && pnpm test:e2e`

```bash
git add -A
git commit -m "feat(041): el respaldo lleva las capturas adentro"
```

---

### Task 11: Que un `.json` viejo siga entrando

The regression that matters most: this plan touched the validator, the shape list and the merge comparison.

**Files:**
- Test: `src/lib/export-import/schema.test.ts`, `src/lib/export-import/merge.test.ts`

- [ ] **Step 1: Write the tests**

```javascript
it('spec 041: los respaldos de las versiones 1 a 5 siguen entrando', () => {
	for (const formatVersion of [1, 2, 3, 4, 5]) {
		const result = validateBackup(makeBackup({ blocks: [makeBlock()] }, { formatVersion }));
		expect(result.ok, `versión ${formatVersion}`).toBe(true);
	}
});

it('spec 041: un bloque sin los campos de imagen no es un conflicto contra uno que los tiene en null', () => {
	const viejo = { ...makeBlock() };
	const nuevo = { ...makeBlock(), imageId: null, imageType: null, imageBytes: null, imageWidth: null, imageHeight: null };
	expect(sameToTheUser(viejo, nuevo)).toBe(true);
});
```

- [ ] **Step 2: Run them**

Run: `pnpm vitest run src/lib/export-import/`
Expected: PASS. If the second fails, `sameToTheUser` is not reading `BIRTH_DEFAULTS` for the new fields — fix that, not the test. This is the exact hole spec 040 measured at 1154 conflicts.

- [ ] **Step 3: Import Hernán's real backup**

Take his current `.json`, import it with *Importar y conservar lo mío*, and read the summary. Expected: **0 conflicts, 0 duplicated rows**. Any other number means the birth defaults are wrong, and it must be fixed before going on.

- [ ] **Step 4: Commit**

```bash
git add src/lib/export-import/
git commit -m "test(041): un respaldo viejo entra sin conflictos"
```

---

### Task 12: La guía, el changelog y el gate a mano

**Files:**
- Create: `docs/guia/<n>-imagenes.md`
- Modify: `docs/guia-de-uso.md`, `CHANGELOG.md`, `docs/guia/11-respaldo.md`

- [ ] **Step 1: Write the guide topic** — `docs/guia/<n>-imagenes.md`, plain Spanish, no jargon: how to paste a screenshot, that clicking it opens it big, that the description is optional and searchable, the 5 MB limit and what happens when you go over, that images travel in the backup, and what does **not** work yet (shared notes, snippets, Markdown/HTML export).

- [ ] **Step 2: Update `docs/guia/11-respaldo.md`** — the backup can now be a `.copynotes` file; it is a normal ZIP that opens with a double click, and the JSON is readable inside it. Both files import.

- [ ] **Step 3: Update the index date** in `docs/guia-de-uso.md` ("Última actualización").

- [ ] **Step 4: `CHANGELOG.md`** — one bullet per visible change, in the in-progress version's section, in plain Spanish. This is what the desktop app shows under Configuración › Actualizaciones and what becomes the GitHub Release body. **Writing it at release time does not work: `latest.json` is generated during the build.**

- [ ] **Step 5: The manual gate — nothing here can be automated**

Run through this on **each** of the four targets: the macOS `.app` (packaged, per `docs/release-checklist.md`), the Windows `.app`, a browser, and the iPhone.

| # | Step | Expected |
|---|---|---|
| 1 | Paste a screenshot | appears with no jump, at the right size |
| 2 | Click it | opens full screen, readable; `Esc` closes |
| 3 | Type a description, then reload | the description is there |
| 4 | Reload with the network off | the same image |
| 5 | Paste the same screenshot again | two blocks; Configuración shows the space grew once, not twice |
| 6 | Paste text right after | ordinary text, no image path taken |
| 7 | Paste with an empty clipboard | nothing breaks |
| 8 | Drop a `.svg` on a row | refused with a message |
| 9 | Drop a file over 5 MB | refused with a message, no block left behind |
| 10 | `/imagen` and cancel the picker | nothing changed: no type change, no caret move |
| 11 | `Enter` on an image, then `Backspace` twice | new row; first press focuses the image, second deletes it. **Never joins with the row above** |
| 12 | Try to share a note with an image | refused |
| 13 | Try to save it as a snippet | refused |
| 14 | Export the backup | a `.copynotes`; `unzip -l` lists the images |
| 15 | Wipe the database, import it | same images, byte for byte |
| 16 | Import an old `.json` | 0 conflicts |
| 17 | Export the note to Markdown | `[Imagen: …]`, no `blob:` |

- [ ] **Step 6: Commit**

```bash
git add docs/ CHANGELOG.md
git commit -m "docs(041): la guía y el changelog de las capturas"
```

---

## Lo que sigue: parte B (la nube)

**Not a plan yet, and deliberately so.** Part B's code names the interfaces part A creates, so writing it before part A exists would be writing against guesses. It gets its own plan document once Task 12 passes, and it covers spec 041 §6 and §7:

1. **SQL:** the private `image-bodies` bucket, four RLS policies keyed on `auth.uid()` as the first path segment, `vaults.min_protocol`, `push_records(payload, p_protocol default 1)`, and four new attacks in `scripts/rls-check.mjs`.
2. **Subir:** AES-GCM under the vault key with `image:<imageId>` as additional data; the object path `<uid>/<HMAC-SHA256(vaultKey, imageId)>`; the hold-back rule in `pending.ts` — which **must** read its set once per call and filter synchronously, exactly like `skipsSharedRows` does, because a Dexie query cannot live inside that callback; and the two rows that are never held back (a tombstone, and a block whose body is missing locally).
3. **Bajar:** the reconciliation that finds *reference present, body absent*; hash verification on arrival; a write that does **not** stamp `changeSeq`; an in-place update that never re-mounts the editor; and the `Imagen no disponible` state.
4. **The two-device gate**, run the way `copynotes-two-device-gate-method` describes.

**The branch does not merge to `main` until part B passes its gate.** Spec 041 is explicit: the door must not open in a version that cannot carry the image to the other device.
