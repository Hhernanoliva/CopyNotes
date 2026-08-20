# 041 - Capturas de pantalla en las notas

Created: 2026-08-20, out of Hernán's request to look at images seriously, and out
of the exploratory draft `docs/analisis-futuro-imagenes-en-notas.md` — which this
spec supersedes wherever the two disagree.

**Estado: escrita, sin construir.** Ninguna línea de código existe todavía.

Every number below was measured on 2026-08-19/20 against the current code and
against five of Hernán's real screenshots, not estimated. The measurements are in
§2 and in `docs/analisis-futuro-imagenes-en-notas.md` §0.9.

## En criollo (resumen para Hernán)

Vas a poder **pegar una captura de pantalla adentro de una nota**, en la web y en
la aplicación de escritorio, y la captura va a **viajar entre tus aparatos igual
que viaja el texto** — cifrada, sin que el servidor pueda abrirla — y va a **entrar
y salir del respaldo**.

Tres decisiones que salieron de medir, no de opinar:

**La captura se guarda tal como vino.** No se convierte, no se achica, no se
recodifica. Cuando le pedimos al navegador que la apretara de nuevo, ahorró entre
8% y 10%: nada. Y pedirle WebP a Safari devuelve un PNG **sin avisar**, cinco de
cinco veces. Tocar los bytes es todo riesgo y ningún premio.

**El tope va en peso y no en tamaño.** Una de tus capturas mide 3018 × 1312 y pesa
325 KB; otra mide 578 × 526 —treinta veces más chica— y pesa 345 KB. El borrador
quería un tope por píxeles: le habría borroneado el texto a la grande sin tocar la
que de verdad pesa. **El tope es 5 MB por captura, sobre el peso.** Tu más pesada
fue 1,66 MB.

**El nombre de cada captura es su huella digital.** Eso hace que reemplazar nunca
pise nada, que copiar y pegar no duplique el archivo, que la misma captura pegada
dos veces ocupe una sola vez, y que el respaldo pueda comprobar por sí solo que no
le falta nada.

Lo que **no** entra en esta versión, a propósito: compartir una nota con imágenes,
guardar un atajo con imágenes, buscar el texto que hay adentro de la captura, y
liberar el espacio de una captura borrada. Los cuatro están anotados al final.

Y una cosa que se puede postergar sin costo: **comprimir más**. Queda entre 25% y
30% de jugo, pero se aprieta al pegar, antes de guardar, así que sumarlo el día de
mañana no convierte ni migra nada — las capturas viejas quedan como están.

## Objective

Let a person paste a screenshot into a note and have it behave like every other
piece of their content: present offline, carried by the encrypted sync to their
other devices, and inside the full backup — without the server ever being able to
open it, and without a single silent loss on any of those paths.

## 1. Por qué capturas y no fotos

Hernán's stated use: **screenshots pasted from the clipboard**, essentially never
a photo from a phone camera. That single fact deletes most of the draft's ingest
work.

| Draft step | With screenshots |
|---|---|
| Convert the iPhone's HEIC | **Gone.** Screenshots are PNG on macOS and Windows. |
| Strip EXIF and GPS | **Gone.** A screenshot carries neither. |
| Fix orientation | **Gone.** No screenshot arrives rotated. |
| Downscale to 2560 px | **Inverted.** On a photo, downscaling is free. On a screenshot it **blurs the text that was the point of capturing it.** |
| Drag files, multi-select picker | **Demoted.** The real door is Ctrl/Cmd+V. |

## 2. Lo medido

Five real working screenshots, pasted into a throwaway probe in Safari 26.5 on
Hernán's Mac, 2026-08-20:

| Medidas | Pesa | Al pedir WebP llegó | PNG a la mitad |
|---|---|---|---|
| 1540x1292 | 1,66 MB | **PNG** — 1,57 MB | 522 KB |
| 3018x1312 | 325 KB | **PNG** — 294 KB | 119 KB |
| 578x526 | 345 KB | **PNG** — 326 KB | 112 KB |
| 2506x660 | 126 KB | **PNG** — 117 KB | 50 KB |
| 816x788 | 57 KB | **PNG** — 49 KB | 18 KB |

What it settles:

1. **Paste delivers a real file** in WebKit — the same engine as the macOS desktop
   app. Arrives as `image.png`, type `image/png`, signature matching.
2. **`canvas.toBlob('image/webp')` returns `image/png` in Safari, with no error**,
   5 of 5. The HTML spec mandates the PNG fallback when a type is unsupported. It
   hits 2 of the 4 targets (macOS `.app`, iPhone web); Windows/WebView2 can encode.
3. **Re-encoding buys 8-10%.** That does not pay for any risk.
4. **Bytes do not track pixels.** 4 megapixels → 325 KB; 0.3 megapixels → 345 KB.
   Content decides, not size. **The cap is on bytes.**
5. Real sizes are small. Median ~325 KB, heaviest 1,66 MB.

And from the code, measured 2026-08-19:

| measurement | result |
|---|---|
| `sync/records.ts` on a row holding a `Blob` | `JSON.stringify` → `{}`, **bytes lost** |
| undo snapshots held in memory (`editor/history.ts:6`) | up to **100 full copies** of the block list |
| `img-src` in `vite.config.ts:64` | `'self'`, `data:` — **no `blob:`** |
| `<img>` in the sanitizer allow-list (`format/sanitize.ts:24`) | absent → stripped, deliberately |
| server-side `table_name` check (`supabase/schema.sql:35`) | 7 tables; a new synced table is **already refused** |
| backup versions an old app accepts (`export-import/schema.ts:16`) | 1..5 → a v6 file **fails with a message**, never silently |

## 3. What enters

### 3.1 Un bloque nuevo, `type: 'image'`

`'image'` joins `BLOCK_TYPES` in `src/lib/format/blocktype.ts` — the single list
that backup validation and the ingest gate both already read.

Chosen over hanging an image off a `text` block because the editor needs an
explicit branch: `BlockRow.svelte:163` treats everything that is not `code` or
`separator` as rich text, so a type without its own branch silently becomes
another `contenteditable`. An explicit type also makes an old app's backup
validator **reject** the file (§2, row 6) instead of claiming success.

### 3.2 El identificador es la huella

`imageId` = the SHA-256 of the stored bytes, lowercase hex, 64 characters.

This is not decoration. It removes rules the draft had to write by hand:

| Because the id is the hash | The rule that disappears |
|---|---|
| Different bytes → different id | "replacing must never overwrite an existing body" |
| Same bytes → same id | "copy / snippet / import must clone the body" |
| Same bytes → same id | undo and redo keep working with no special case |
| The name **is** the checksum | the backup verifies itself |
| Same bytes → same object path | a retried upload cannot duplicate or overwrite |

**The cloud path must not be the raw hash.** A raw content address enables the
*confirmation-of-a-file* attack: whoever holds the database can ask "does this
account hold this known image?" without decrypting anything. So the object path
is `HMAC-SHA256(vaultKey, imageId)` — deterministic inside the account (so dedupe
and idempotent uploads survive) and uncomputable outside it.

### 3.3 Guardar los bytes tal como vinieron

No conversion, no re-encode, no downscale, no metadata stripping. §2 rows 2 and 3.

The only preparation before storage:

1. Read the first 16 bytes and check the **real signature**, not `file.type` and
   not the name. PNG, JPEG, WebP and GIF are accepted; anything else is refused.
   **SVG is refused** — it is a document that can carry script, not a picture.
2. Refuse over **5 MB**. On bytes. Three times Hernán's heaviest, and under the
   6 MB above which Supabase asks for resumable uploads.
3. Read `width`/`height` via `createImageBitmap` (measured working in WebKit,
   including `imageOrientation: 'from-image'`), so the note reserves the exact
   space and does not jump while the picture loads. A file that cannot be decoded
   is refused.
4. `crypto.subtle.digest('SHA-256', bytes)` → `imageId`.

Only then does anything touch storage.

### 3.4 Las puertas de entrada

- **Pegar** (`Ctrl/Cmd+V`) — the main door, and the one §2 proved works.
- **`/imagen`** in the slash menu — opens the file picker.
- **Arrastrar** a file onto a row — free, because the same ingest function takes a
  `File` either way.

A paste that carries no file falls through to the existing text path untouched.
(Observed in the probe: one paste arrived with no file and no types at all.)

A `<img src="https://...">` copied from a web page is **never fetched**. Only a
real file handed over by the clipboard is accepted. This is already the behaviour
the sanitizer produces and it does not change.

Cancelling the picker consumes nothing: no `/imagen` swallowed, no type changed,
no caret moved.

### 3.5 Cómo se ve y cómo se maneja

- Rendered with `URL.createObjectURL`, revoked when the row goes away.
- `width`/`height` attributes from the stored dimensions; `loading="lazy"`;
  `decoding="async"`.
- Scaled down to the note column, aspect ratio kept. Never scaled up.
- **Click opens it full-screen at natural size**, scrollable. `Esc` or a click
  closes it. Not decoration: a 3018 px screenshot inside a ~700 px column is
  unreadable, and reading it is the entire use case.
- An optional **description** below the image: one line of plain text (no inline
  formatting), stored in `content`, doubling as the `alt` text and searchable.
- An image with no description is still a block with content, not an empty row.
- `Enter` on an image block makes a new text row below, per the existing hierarchy
  rules.
- `Backspace` at the start of the description focuses the image first; a second
  press deletes the block. **It never joins the file with the row above.**
- `Tab`, `Shift+Tab`, multi-select, move and collapse stay structural and behave
  exactly as they do for every other block.
- The `/` type menu can neither turn an image into something else nor turn
  something else into an image.

`img-src` in `vite.config.ts` gains `blob:`. `e2e/security-csp.spec.ts` asserts
the policy and will fail until it is updated — deliberately.

### 3.6 Cuota local

- Ask for persistent storage (`navigator.storage.persist()`) the first time an
  image is saved, not only when the vault is created.
- Check `navigator.storage.estimate()` before writing, and treat it as guidance.
- Treat `QuotaExceededError` as the definitive answer.
- **No total cap in v1.** A ceiling without a way to free space traps the person,
  and freeing space is explicitly out of scope (§9). The browser's own limit is
  the limit, and it is reported honestly when hit.
- Never leave a block without its body, or a body without its block.

## 4. Model of data affected

### 4.1 Campos nuevos en `blocks`

| field | value |
|---|---|
| `imageId` | 64-char hex, or `null` |
| `imageType` | `'image/png'` \| `'image/jpeg'` \| `'image/webp'` \| `'image/gif'`, or `null` |
| `imageBytes` | number, or `null` |
| `imageWidth` / `imageHeight` | number, or `null` |
| `content` | the description; `''` when there is none |

**No Dexie migration backfills these fields onto existing blocks.** Absent and
`null` mean the same thing here, and `missingShapeFields` already fills them on
the way in from a backup. A v13 upgrade that walked every row would write ~1127
rows for no gain; v12's pattern exists (`db.ts:190`, and `changeSeq` deliberately
untouched at `db.ts:186`) if that ever becomes necessary, but it is not.

**All five join `BIRTH_DEFAULTS` in `storage/shape.ts` with `null`.** This is not
optional bookkeeping. Spec 040 measured what happens when a field exists on one
side and is absent on the other: **1154 conflicts and 1147 duplicated rows** on a
file byte-identical to the device's own data. `sameToTheUser` forgives *absent vs
birth value*; it cannot forgive *absent vs undeclared*.

### 4.2 Tabla local nueva: `imageBodies`

Dexie version 13. `imageBodies: 'imageId'` — **the primary key only.** The blob is
never indexed.

| field | meaning |
|---|---|
| `imageId` | primary key, the hash |
| `blob` | the bytes, exactly as they arrived |
| `type`, `bytes`, `width`, `height` | the same metadata the block carries, so a body can be validated on its own |
| `createdAt` | when this device first held it |
| `uploadedFor` | the account id these bytes have been uploaded for, or `null` |

**`imageBodies` is NOT a synced table.** It is not in `SYNCED_TABLES`, it gets no
`changeSeq` hook, and it never appears in `records`. The server-side `table_name`
check (`supabase/schema.sql:35`) already refuses it, and that refusal stays.

**The bytes are written first, then the block.** All preparation in §3.3 — the
one that can refuse — happens before either write. The order is the guarantee,
and it is directional on purpose: an orphan body is invisible and recoverable,
while a block pointing at bytes that do not exist is a broken picture on screen.
A real Dexie transaction across the two tables was considered and dropped: it
would have to nest `createBlock` (and its hooks, its ordering read and its
`bumpAgentData`) inside an outer transaction, which buys nothing the ordering
does not already buy.

Every write still goes through `createBlock` / `putBlock` / `updateBlock` in
`storage/blocks.ts`, all of which sit inside `trackPendingWrite`. A direct write
would leave a queued save that overwrites it half a second later.

### 4.3 Las cinco listas del respaldo (AGENT.md)

A new storage surface owes the backup five lists. Written out, because two pipes
in a row got this wrong and neither error was found by a test.

| list | what this spec does |
|---|---|
| `LOCAL_ONLY_FIELDS` | Nothing is added, and the reason matters: the list is flat (`['changeSeq','cloudSeq','fromCloud','share','serverSeq']`) and is applied to rows of `BACKUP_TABLES`, which `imageBodies` deliberately is not. `uploadedFor` stays out of the file because the manifest's `images` array is built **field by field** (`imageId`, `type`, `bytes`, `width`, `height`), never by dumping the row. Whoever ever adds `imageBodies` to `BACKUP_TABLES` owes `uploadedFor` to this list in the same commit — it is this device's note about one account and means nothing anywhere else. |
| `BACKUP_TABLES` | `imageBodies` is **deliberately not added**, because its rows are not JSON. The bytes travel as files inside the package (§5) and the manifest carries their metadata. **Consequence that must be handled explicitly: "Reemplazar todo" clears tables by walking `BACKUP_TABLES`, so it must clear and repopulate `imageBodies` by hand.** Whoever "fixes" this omission by adding the table to the list will produce a backup with base64 blobs in it. |
| `SETTINGS[key].backupSafe` | no new setting. The persistent-storage request is a browser permission, not a preference. |
| `resetCloudState()` (`sync/leave.ts`) | must set `uploadedFor = null` on every body. Without it, "Empezar de nuevo la nube" believes the new account already holds bytes it has never seen. |
| `BIRTH_DEFAULTS` (`storage/shape.ts`) | the five block fields, `null` each. §4.1. |

## 5. El respaldo

### 5.1 Dos formatos, una regla

- **A backup with no images stays exactly as it is today**: a `.json` file,
  `formatVersion: 5`, readable in any text editor, importable by older apps.
- **A backup with images is a `.copynotes` package**, `formatVersion: 6`.

The branch is one line and it buys a lot: everyone who never pastes an image keeps
full backward compatibility and the literal "open it with Notepad" promise. And a
v5 file produced by the new app still imports into an **older** app, because
`blockSchema` is a `looseObject` — the five new fields ride through unchecked.

"Has images" means **any** `imageId` referenced by any block the file carries,
**including the trash**. A soft-deleted image block still references its body
(§9.1), so a note emptied into the trash still produces a `.copynotes`.

```text
copynotes-backup-YYYY-MM-DD-HHMM.copynotes
├── backup.json          ← the same format, formatVersion 6
├── README.txt           ← what this file is, in Spanish
└── images/
    ├── <imageId>.png
    └── <imageId>.jpg
```

`backup.json` gains one array:

```json
"images": [{ "imageId": "…64 hex…", "type": "image/png", "bytes": 332372,
             "width": 3018, "height": 1312 }]
```

### 5.2 ZIP sin compresión, sin librería

The package is a real ZIP written by hand, roughly 100 lines, **using the STORE
method only** — nothing is compressed.

Three reasons, in order of weight:

1. **A zip bomb becomes impossible by construction.** With STORE the compressed
   size equals the uncompressed size, so a declared size cannot lie about what it
   expands to. Four of the draft's §9 defences stop being necessary.
2. Screenshots are already compressed. Deflating them again saves nothing.
3. No dependency. The project has **seven runtime dependencies in total**, and
   spec 015 asks each one to justify itself.

It stays a real ZIP: a double click on macOS or Windows opens it, and `backup.json`
is right there, readable.

**The importer accepts STORE entries only.** A DEFLATE entry — which our own
exporter never writes — is refused rather than decompressed. That is what removes
the last decompression path, and with it the last bomb surface. If a future
version ever needs to read a compressed package, `DecompressionStream('deflate-raw')`
is native (baseline since May 2023, Safari 16.4+) and still needs no library.

### 5.3 Qué rechaza el importador, antes de tocar nada

- Any entry name outside the allow-list: exactly `backup.json`, `README.txt`, and
  `images/<64 hex>.<ext>`. This kills `../`, absolute paths and surprises in one
  rule instead of three.
- A repeated entry name.
- More entries than the manifest declares images, plus two.
- A single entry over 5 MB, or a package over a declared total.
- A `.json` file claiming `formatVersion: 6` — the bytes cannot be there.

### 5.4 `complete: true` tiene que ganárselo

The manifest may only declare `complete: true` when, for **every** `imageId`
referenced by a block:

1. the file exists in `images/`, and
2. its length equals the declared `bytes`, and
3. its SHA-256 equals the `imageId`.

If a body is missing — because a previous failure lost it — the export still
happens, is written as `complete: false`, and says so on screen. A backup that is
missing one picture and admits it beats a backup that claims to be whole.

Spec 040 rule 6 is exactly this, and this is the first case where the answer is
not always `true`.

### 5.5 Importar

- `.json` v1..v5: unchanged, forever.
- `.copynotes` v6: validated end to end (§5.3, §5.4) **before a single current row
  is touched**. "Reemplazar todo" checks the package, the references, the hashes
  and the available space first; only then does it delete anything.
- Bodies are written first, blocks second. A crash in between leaves orphan bodies,
  which is recoverable; the reverse leaves blocks pointing at nothing.

## 6. La nube

### 6.1 Subir

1. Block and body are saved locally (§4.2), one transaction.
2. The existing pending mechanism finds the block row.
3. **The bytes go up first.** `pending.ts` holds back any block row whose
   `imageId` has `uploadedFor !== currentAccount`. This reuses the machinery
   `upload.ts` already has for keeping the oldest rejected row below the cursor —
   nothing new is invented to remember a pending image.
4. The bytes are encrypted with AES-GCM under the vault key, a fresh IV, and
   `image:<imageId>` as additional authenticated data — so a body cannot be moved
   to another image or another vault and still decrypt.
5. The object is uploaded to the private bucket at
   `<uid>/<HMAC-SHA256(vaultKey, imageId)>`, content type
   `application/octet-stream`. The object is immutable: the same bytes always land
   on the same path, so a retry after a lost response overwrites itself with
   itself.
6. `uploadedFor` is set. Now the block row uploads through the normal path.
7. `cloudSeq` is confirmed by the existing mechanism.

**Two rows are never held back**, because holding them would stall the cursor
forever:

- a **tombstone** — a deleted block does not wait for bytes to be uploaded;
- a block whose **body is missing locally**, which happens after importing a
  package that declared `complete: false`. The reference travels; the other device
  looks for the object, does not find it, and shows *Imagen no disponible*. That
  state must exist and be visible — a reference that can never resolve must not
  spin on *Descargando imagen* forever.

**One image at a time**, or a concurrency of two at most. The batch allows 200
rows; encrypting 200 images because of that would exhaust a phone.

The server sees: an account, an approximate size, a count, and a time. Not the
format, not the dimensions, not a filename, not a pixel.

### 6.2 Bajar

1. The block arrives through the existing encrypted channel.
2. The row renders immediately, as a grey box of the exact stored size, saying
   *Descargando imagen*. The rest of the notes are not blocked.
3. A reconciliation pass finds every `imageId` referenced with no local body.
4. It downloads, decrypts, **recomputes the SHA-256 and refuses anything whose
   hash is not its name**, and writes the body.
5. It writes through a path that does **not** stamp `changeSeq` — a downloaded
   body is not a local edit.
6. It signals the other tab and updates only the picture. **It never re-mounts the
   editor**: re-mounting steals the caret and splits rows, and someone may be
   typing the description at that moment.

An interruption after the block and before the body loses nothing: *reference
present, body absent* is found again on the next start. No second queue is needed.

### 6.3 Bucket y aislamiento

Private bucket `image-bodies`. RLS on `storage.objects`: for select, insert,
update and delete, the first path segment must equal `auth.uid()`. One account can
neither list, read, write nor delete another account's objects. `scripts/rls-check.mjs`
gains those four attacks.

### 6.4 Nada se borra de la nube

v1 never deletes a remote object that was ever referenced. Another device, offline
for a month, may still need it. See §9.

## 7. Compatibilidad entre versiones

The desktop app does not update itself, so one person can run two versions.

### 7.1 El guardia va en la puerta de subida, y sólo ahí

`push_records` is **literally the only door** a row can come in through: direct
writes to `records` are refused by policy and the function runs as its owner
(`supabase/schema.sql:96`). So the guard lives there and nowhere else.

- `vaults` gains `min_protocol int not null default 1`. Reusing the table that is
  already one row per owner beats inventing another.
- `push_records` gains `p_protocol int default 1`.
- A client pushing a block row that carries an `imageId` passes `p_protocol => 2`,
  and the function raises that owner's `min_protocol` to 2.
- If `min_protocol > p_protocol`, the function raises. An old client calls the old
  signature, gets the default of 1, and is refused.

An old client therefore: **keeps downloading** and shows the image block as a text
row carrying the description — harmless, effectively read-only; **cannot upload
anything**, so the app shows *Actualizá CopyNotes para seguir sincronizando*; and
its backup is refused by the new app on the version number (§2, row 6).

### 7.2 Lo que este guardia NO cubre, dicho en voz alta

The download path is **not** versioned. An old client can still hold `type: 'image'`
rows in its local database and export them into a `formatVersion: 5` `.json` —
a file that the old app itself cannot re-import, and that carries no bytes.

That is a strange file, not a silent loss: it fails with a message wherever it is
opened. For a beta across Hernán's own devices this is accepted, deliberately, in
exchange for not building a versioned download RPC and an RLS header check. It is
listed as debt in §9 and must be revisited before the cloud opens to the public.

### 7.3 No se habilita el botón sin probar esto

- new app on one device, old app on another;
- a backup taken from the old app after the account already uses images;
- updating the old device, and convergence afterwards;
- the response lost during the very first image, the one that raises the protocol.

## 8. What does not enter

| Out of v1 | Why, and where it is blocked |
|---|---|
| **Images in shared notes** | Blocked in four places, because hiding a button is not a check: the share dialog refuses a note containing images; `/imagen`, paste and drop explain themselves inside a shared note; the storage operation re-checks; and the shared-channel serializer **refuses explicitly** rather than sending the description alone and pretending everything travelled. The guest is already read-only for blocks. |
| **Snippets with images** | Saving a selection that contains an image is refused with a message. A snippet is independent of its note, and its export would carry a reference with no body — not a valid export. Cheap to enable later precisely because content addressing means nothing has to be cloned. |
| **Markdown / HTML note export** | Writes `[Imagen: descripción]` and says on screen that images were not included. A `blob:` URL is **never** exported: it stops existing when CopyNotes closes. |
| **The agent (MCP)** | `export.json` carries `[Imagen: descripción]`. No bytes, no dimensions, no ids. The authorisation Hernán granted was for text and tasks. A tool that hands an agent a picture is a separate feature with its own permission, not a consequence of `agentVisible`. |
| **Searching inside the image (OCR)** | Only the description is searched. OCR would have to run on every device separately — the server cannot help, by design. |
| **Freeing the space of a deleted image** | §9. |
| **More than one image per block** | One block, one image. |
| **Compressing further** | §9. |

## 9. Deudas anotadas

1. **Nothing is ever deleted.** A soft-deleted block still references its image,
   because the backup carries the trash (spec 040, Hernán's decision of 16/8).
   Undo, redo, a replaced image and an unresolved conflict all count as
   references. So v1 has no way to reclaim space, locally or in the cloud. This
   must be answered before a public release, and it must not be answered by
   inventing a cap that traps the person.
2. **Comprimir más.** 25-30% is available: lossless WebP, or a proper PNG
   re-squeeze — both need a library, and lossy WebP is disqualified because it
   frays text, which is what a screenshot is made of. **This can be added later at
   no cost**: compression happens at paste time, before storage, so old images
   stay as they are and nothing migrates. Revisit when the Supabase bill, not the
   principle, is the constraint.
3. **The download path is unversioned.** §7.2.
4. **Two devices that replace the same image while offline.** Handled as any other
   conflict, by the block row — but both bodies stay on disk, and rule 1 means
   neither is ever cleaned up.
5. **Two pre-existing bugs in the shared channel**, found by the draft and unrelated
   to images, but blocking for any future shared-image phase: `listSharedPending`
   truncates at 200 rows while `shareNote` calls `pushSharedNote` once and then
   deletes the whole list from the encrypted channel, so a note over 200 rows can
   leave the old channel before finishing its entry into the new one; and
   `unshareNote` re-seals the rows and closes the shared channel without waiting
   for the encrypted copy to be uploaded, so an interruption can briefly leave the
   server with no copy at all. These deserve their own fix regardless.

## 10. Acceptance criteria

1. Pasting a screenshot in the web app and in the desktop app creates an image
   block showing that screenshot, with no visible jump while it loads.
2. Reloading with no connection shows exactly the same image.
3. The same screenshot pasted twice occupies one body.
4. A file whose signature does not match an accepted format is refused, whatever
   its name or `file.type` says. An SVG is refused.
5. A file over 5 MB is refused with a message, and leaves no block behind.
6. A quota failure leaves neither a block without a body nor a body without a
   block.
7. A database with no images exports a `.json` v5 that both this app and an older
   one still import. It is **not** byte-identical to today's file: blocks created
   after this change carry the five new fields at `null`.
8. A note with images exports a `.copynotes` whose every reference has its file,
   its length and its hash — or which declares `complete: false` and says so.
9. Exporting, wiping the database and importing returns identical bytes.
10. `.json` backups from versions 1 to 5 import unchanged.
11. A second device receives the block, shows *Descargando imagen*, then the
    image — without the editor re-mounting or the caret moving out of a
    description being typed.
12. Interrupting between the block and the body repairs itself on the next start.
13. Nothing of the image is readable in Storage or in `records`.
14. An account cannot list, read, write or delete another account's objects.
15. An old client cannot upload to an account that already uses images, and says
    so; it can still download.
16. A note with images cannot be shared, and a shared note cannot take an image —
    verified at the storage layer, not only in the UI.
17. `export.json` carries `[Imagen: descripción]` and no bytes.

## 11. Minimum tests

**Unit (Vitest).** Signature detection including a lying extension and a truncated
file; the 5 MB refusal; `imageId` equals the SHA-256 of the stored bytes; the
transaction leaving nothing behind on failure; ZIP writing and reading round trip;
the importer refusing `../`, absolute names, duplicates, a DEFLATE entry, an
oversized entry and too many entries; `complete` false when a body is missing;
v1..v5 JSON still importing; `sameToTheUser` treating an absent `imageId` against
its birth `null` as agreement; `resetCloudState` clearing `uploadedFor`.

**e2e (Playwright).** `/imagen` and the picker; cancelling the picker consuming
nothing; Enter, Backspace, Tab, selection, move, collapse and undo on an image
block; the type menu refusing both directions; the share dialog refusing; the
snippet refusing.

**RLS (`scripts/rls-check.mjs`).** Four new attacks: list, read, write and delete
across accounts.

**By hand, because no test can do it.** **Pasting cannot be covered by e2e** —
Playwright's Ctrl+V does not fire a real system paste. Neither can the native
picker, which already cost one production bug. Both are verified by a person on
all four targets: macOS `.app`, Windows `.app`, browser, iPhone.

## 12. Agent notes

- **`writeBlock` does not exist.** The draft says it does. The real doors are
  `createBlock`, `putBlock` and `updateBlock` in `storage/blocks.ts:14,65,120`.
- **Pixels never enter the block row.** `editor/history.ts:6` keeps up to 100 full
  snapshots; bytes in the row would be copied a hundred times in memory.
- **Pixels never enter a synced row.** `sync/records.ts` does `JSON.stringify`; a
  `Blob` becomes `{}` and the bytes are gone with no error.
- **Never trust a requested encoding.** If any future code asks `toBlob` for a
  format, it must read `blob.type` afterwards. Safari answers PNG in silence, 5 of
  5 measured.
- **The cap is on bytes, never on pixels.** §2 row 4.
- **A body arriving from the cloud is not a local edit.** It must not stamp
  `changeSeq`, and it must update the picture in place — re-mounting the editor
  steals the caret and splits rows.
- **`imageBodies` stays out of `SYNCED_TABLES` and out of `BACKUP_TABLES`**, and
  §4.3 says what each omission obliges instead. Adding it to either list looks
  like a fix and is not.
- The five block fields must land in `BIRTH_DEFAULTS` in the same commit that adds
  them, or every existing block becomes a conflict (spec 040 measured 1154).
- **An image block with no description is not an empty row.** `BlockRow.svelte:177`
  decides the placeholder from `content === ''`; the image branch has to be
  excluded, or a captioned-less screenshot renders as a prompt to type.
- **A row with an empty block stores `"\n"`, not `""`** — the existing trap. Any
  length check over an image block's `content` inherits it.
- The description is **plain text**, so it does not travel through `block.html`
  and does not touch the ingest gate. If it ever gains inline formatting, it does:
  `format/ingest.ts` is the only door, and `block.html` is an `innerHTML` sink.
