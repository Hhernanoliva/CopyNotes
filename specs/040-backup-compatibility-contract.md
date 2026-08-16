# 040 - El contrato del respaldo: un archivo que la app bajó siempre entra

Created: 2026-08-16, out of the bug Hernán hit at the end of the spec 038 manual
gate — a backup **the app itself had exported** could not be imported — and out of
the three questions he asked afterwards: *will this break again when the engine
changes?*, *what happens when a third sync pipe arrives (paid hosting)?*, and
*can another person import my file?*

Every number below was measured against the current code on 2026-08-16, not
estimated.

**Construida entera el 2026-08-16** (rama `feat/nota-compartida`, sin subir). El
resultado del gate manual está al final del plan, y el hallazgo que destapó está en
la regla 2.

## En criollo (resumen para Hernán)

Anoche un respaldo que **CopyNotes había bajado** no se pudo importar. Un solo
renglón al que le faltaba una marca interna, y el archivo entero quedó
inservible. Se arregló la causa (los renglones que llegan de otro aparato ahora
quedan completos), pero eso repara **la base de datos** — **los archivos .json que
ya tenés bajados siguen muertos.**

Y cuando preguntamos "¿esto va a volver a pasar?", apareció lo importante: el
respaldo se rompió porque apareció un **escritor nuevo** de renglones (el caño de
compartir, de esta semana). Cada caño nuevo tiene que tocar **cinco listas** del
respaldo. El primero acertó las cuatro que existían. El segundo acertó tres de
cinco. Y **ninguno de los dos errores lo encontró un test** — los encontró un
humano probando a mano, semanas después. Acordarse no es un mecanismo.

Esta spec fija siete reglas (tres son la misma historia contada en tres lugares) y
construye **el mecanismo que hace que el caño número tres no pueda repetirlo**: una
prueba que se pone roja el día que alguien agrega un campo obligatorio, y otra que
se pone roja el día que un campo interno se filtra al archivo.

Además dice en voz alta dos cosas que hoy la app no dice: que **el archivo se lee
con el Bloc de notas** (no tiene contraseña), y que **también lleva la papelera** —
lo que borraste. La papelera sigue viajando: es tu decisión del 16/8, y es lo que
hace que restaurar te devuelva una nota borrada.

## Objective

Turn "a backup the app produced can always be restored" from luck into a rule the
test suite enforces, and write down what a new sync pipe owes the backup so the
third one cannot repeat the second one's mistakes.

Measured 2026-08-16 against the current code:

| measurement | result |
|---|---|
| valid file whose block lacks `collapsed` | **rejected whole**: `data.blocks.0.collapsed: Invalid key: Expected "collapsed" but received undefined` |
| that same file let through **without filling**, via "Importar y conservar lo mío" | 1 block added, 0 skipped → **duplicates every row** |
| fields the validator requires that `storage/shape.ts` cannot fill | `deletedAt`, on notes/blocks/activity |
| fields added to the format since its first commit | 5 (`dueDate`, `note`, `codeCollapsed`, `folders`, `activity`) — all 5 declared optional **by hand**, five times in a row |
| lists a new sync pipe must touch | 5 |
| lists pipe 2 (spec 038) got right | 3 of 5 |
| lines in `docs/guia/11-respaldo.md` saying the file is readable, or that the trash travels | **0** |

## Why it happens

`validateBackup` is **strict by default** about the row shape: a field is required
unless somebody remembered to write `v.optional`. That is safe while the only
writers of rows are `createNote` / `createBlock` / `appendActivity`, which fill
everything. It stops being safe the moment a second writer exists —
`mergeFromShared` was the first, and a paid hosting pipe would be the second.

And the severity model is inconsistent with the rest of the file. A bitácora line
pointing at a missing task is a **warning** ("losing one log line must never cost
them the whole restore", `schema.ts`). A bad `sortOrder` is a **warning**. A
missing `false` is a **total refusal**.

The five lists a new pipe must touch, and what breaks if it forgets one:

| list | forgotten → |
|---|---|
| `LOCAL_ONLY_FIELDS` (`export-import/schema.ts`) | the file makes claims about a server on another device's behalf. **Pipe 2 forgot `share` — one of the 5 bugs of the 038 gate.** |
| `BACKUP_TABLES` (same file) | a device-local table leaks into a plaintext file, or a table holding user data is silently erased on every restore |
| `SETTINGS[key].backupSafe` (`storage/settings-registry.ts`) | restoring a file hands a device consent, cursors or an account it never had |
| `resetCloudState()` (`sync/leave.ts`) | "Empezar de nuevo la nube" leaves the previous pipe's state behind |
| `storage/shape.ts` (`BIRTH_DEFAULTS`) | the pipe writes incomplete rows → **the backup that device exports cannot be imported.** Pipe 2 forgot this one too. |

## What enters

### 1. A backup the app produced can always be restored

Before validation, any field missing from a row is filled from
`storage/shape.ts` — the **same list** `createBlock` and migration v12 already
use — and one warning says the file came from an older version and was completed.
Never an error.

`deletedAt: null` joins `BIRTH_DEFAULTS` for notes, blocks and activity. It is the
third instance of the same hole and the only one still open.

### 2. Filling, not relaxing — and the difference is measured

Making the fields optional in the schema would let the file in and then **duplicate
every row**: `planMerge` compares whole records with `identical()`, so a row
without `collapsed` is not equal to the local row that has it. Measured: 1 added,
0 skipped, for a file that is byte-identical to what the device holds.

So the fill happens **before** `v.safeParse`, and the schema stays strict. Both
paths get it for free — merge and replace-all — because both read the validator's
output.

**And it goes one level deeper than the spec first said.** Found running this
spec's own manual gate on 2026-08-16, with Hernán's real file: the file was
accepted (rule 1 worked) and the merge still reported **1154 conflicts and 1147
duplicated rows**, without a single letter of a note having changed.

The required fields were only half the problem. The app gained *optional* fields
over time too, so an old row has **no** `dueDate` while today's row has it at
`null`, and `identical()` compares whole records. Measured on the two real files:
`createdBy` absent-vs-`'user'` on 1127 blocks, `dueDate` absent-vs-`null` on 1020,
`codeCollapsed` on 190, `note` on 59, `agentVisible` on 18 notes.

So the comparison itself has to ask the right question: **a field absent on one
side, against its birth value on the other, is not a disagreement.** Anything else
still is — a real `dueDate` against `null` keeps both versions, and a missing
`createdAt` is not forgiven, because there is no birth value to stand in for a date.
Same idea as `sameToTheUser` in the cloud and `sameInAllowList` in the shared pipe;
this is the third time the project needs it.

Re-measured with the same two files after the fix: **1154 → 11 conflicts**, and the
11 are rows Hernán genuinely edited between the two exports.

### 3. A new field is never required, and never bumps the format version

Two halves:

- A field added to the local row shape is either `v.optional` in the backup schema
  or has a default in `storage/shape.ts`. Never neither.
- Adding a field does **not** raise `CURRENT_VERSION`. Raising it locks every
  older app out of the new app's files, which is a real cost and must be paid only
  for a change an older app genuinely cannot read. Precedent: `folders` (v4) and
  `activity` (v5) arrived as optional and every older file still imports.

**The mechanism** — the thing that makes this a rule instead of a habit: one test
builds a backup out of nothing but ids and references, plus whatever
`missingShapeFields` produces, and asserts it validates. The day someone adds a
required field to `blockSchema` without a default, that test goes red. It touches
no valibot internals.

### 4. The pipe mark never travels in a file

Any field that says *which pipe a row travels through*, or *how far a pipe got*, is
device-local: in `LOCAL_ONLY_FIELDS` if it is a row field, `backupSafe: false` if
it is a preference.

This is what makes old files safe forever, and the reason is worth writing down: a
file that knows nothing about a new pipe arrives exactly like a freshly installed
device — no mark means the default pipe, and the truth is one `list_shares()` away
on the first pass. That already works for sharing. It only keeps working while the
mark stays out of the file.

**The mechanism:** an **allow-list test over the exported keys**. A dump is
asserted to contain only the keys declared for each table; an undeclared key fails
the test and has to be added on purpose. Same reasoning `sync/shared-payload.ts`
already applies to the wire: what fails an allow-list is a leak nobody notices,
what fails a block-list is a build error.

### 5. The five-list checklist lives in AGENT.md

The table above, one line each, under a heading a new pipe's author cannot miss.
Rules 3 and 4 mechanise two of the five; the other three are prose, and the spec
says so rather than pretending otherwise.

### 6. A backup declares how complete it is, and a restore is never partial

Today "everything on this device" and "everything" are the same sentence, because
the device is the source of truth. Paid hosting breaks exactly that premise: with
notes living upstairs and a partial local copy, the export button keeps working,
the file stays valid, it says *12 notas* — and the person has 400. Then
*Reemplazar todo*, which since 039 also claims the account, deletes the other 388
**on every device**.

What is built now is small, because no hosting exists yet:

- The exporter answers one question — *did this device hold everything?* — and the
  file records the answer. Today the answer is always yes.
- **An absent answer means complete.** Every file already downloaded lacks the
  field and every one of them *is* complete. Reading absence as "incomplete" would
  silently remove the *Reemplazar todo* button from every backup in existence.
- *Reemplazar todo* refuses a file that does not declare itself complete, and says
  why. The seam exists: the button is already hidden for a file that cannot stand
  on its own (`review.replaceData`).
- **A restore that cannot enter completely is refused before anything is
  deleted.** This is the rule that a plan cap would otherwise turn into a
  half-finished restore over a wiped device.

No hosting machinery, no plan logic, no partial-sync anything. One field, one
guard, one written rule.

### 7. What a person sees when a file cannot enter, and what the file admits

- A file that is genuinely broken produces **a sentence in Spanish**, not
  `data.blocks.718.collapsed: Invalid key…`, and it says how many problems there
  are instead of showing the first of forty.
- The app **checks the backup it just produced** before saying "Respaldo
  descargado". A file that fails its own validation is still saved — a backup
  missing a row beats no backup, the precedent `settlePendingWrites` set — but the
  message says so. Today you find out the day you need it, which is exactly what
  happened.
- The dialog and `docs/guia/11-respaldo.md` say, in plain Spanish: the file is your
  notes **in readable text, with no password**, and it also carries **the trash** —
  what you deleted. Anyone you hand it to can read all of it.

The trash keeps travelling (Hernán, 2026-08-16). It is what makes a restore able
to return a deleted note, and with no trash screen in the app it is the only way
back. Saying it out loud is the price.

## What does not enter

- **Encrypting or password-protecting the backup file.** It would break the two
  things the file is for: moving to another machine, and being readable by a human
  in an emergency — which is literally how Hernán's notes came back once. Named
  because it is the obvious next thought after rule 7.
- **The trash screen.** Still unspecced, still named in 039 as the other half of
  the same broken promise.
- **Any hosting, plan or billing machinery.** Rule 6 builds a field and a refusal,
  not a service.
- **Changes to `planMerge`'s rules, to 039's account claim, to `push_records` or to
  `decide()`.** All of them are right; the gap is at the gate.
- **Raising `CURRENT_VERSION`.** Nothing here requires locking an older app out.
- **Recording who exported a file.** Today a file carries no identity at all
  (format, format version, app version, date, `pwa`/`desktop`, counts, data — that
  is the whole envelope). Adding a name to a plaintext file is its own privacy
  decision, not a compatibility one.

## Model of data affected

Local, no schema change to Dexie except possibly one repair migration:

- `storage/shape.ts` — `deletedAt: null` joins `BIRTH_DEFAULTS` for `notes`,
  `blocks`, `activity`. This file must stay **dependency-free of the database**
  (it has no imports today): the validator that will read it runs in the node test
  project, without IndexedDB.
- **Measure before migrating:** count rows already missing `deletedAt` on a real
  device. If any exist, one `db.version(13)` repeats v12's repair with the
  completed list — same `modify` inside the migration, `changeSeq` untouched. If
  none exist, no migration is written.
- `export-import/schema.ts` — the fill step, the exported-keys allow-list, the
  plain-language errors, the `complete` field on the envelope (optional, absent =
  true).
- `export-import/backup.ts` — writes `complete`.
- `components/BackupDialog.svelte` — the export self-check, the plain-language
  error, the "readable file" line, the refusal for a file that declares itself
  incomplete.
- `AGENT.md` — the five-list checklist.
- `docs/guia/11-respaldo.md` + `CHANGELOG.md` — same commit as the code, per the
  project rules.

Server: nothing. This spec does not touch the cloud.

## User flows

1. **An old file imports.** ⚙️ › Respaldo → Elegir archivo → the summary appears
   with one extra line ("este archivo venía de una versión anterior y se completó")
   → *Importar y conservar lo mío* adds nothing that was already there, and
   *Reemplazar todo…* is available.
2. **Hernán's real file from 2026-08-15 imports.** The one that failed. Same flow,
   no special step.
3. **Downloading a backup.** Unchanged, except that a file which fails its own
   check says so instead of "Respaldo descargado".
4. **A broken file.** One sentence in Spanish naming the file and how many
   problems it has. Nothing of the person's data is touched.
5. **Handing the file to another person.** Works, as today. Before downloading,
   the person has read one line saying the file is readable and carries the trash.
6. **(Future) a file from a partial device.** The summary says the file is not a
   complete copy; only *Importar y conservar lo mío* is offered.

## Acceptance criteria

1. A file whose block lacks `collapsed` imports, with a warning (today: rejected
   whole).
2. Re-importing that same file over the same data adds **0** rows and skips them
   all (today, if let through unfilled: 1 added per row).
2b. A field absent on one side, against its birth value on the other, is not a
   conflict — measured with the real file: 1154 conflicts before, 11 after, and the
   11 are real edits. A real value against a different real value still keeps both
   versions, and a missing timestamp is still a conflict.
3. That same file can be used with *Reemplazar todo*.
4. A file whose rows lack `deletedAt` imports the same way.
5. A backup built from nothing but ids, references and `missingShapeFields`
   validates. (This is the guard: adding a required field turns it red.)
6. A dump contains no key outside the declared allow-list. (This is the guard for
   pipe 3.)
7. A file with no `complete` field keeps *Reemplazar todo* available.
8. A file declaring `complete: false` cannot be used with *Reemplazar todo*, and
   the summary says why.
9. Downloading a backup that fails its own validation warns instead of claiming
   success; the file is still saved.
10. The error shown for a broken file is a Spanish sentence and names the count of
    problems, not only the first.
11. The dialog and the guide both say the file is readable and carries the trash.
12. `AGENT.md` carries the five-list checklist.

## Minimum tests

- **Unit, the two that are red today**: criteria 1 and 2, which are the two
  measurements at the top of this spec turned around.
- **Unit, the guard of rule 3**: the minimal-row backup validates. Prove it goes
  red by adding a required field to `blockSchema` in a scratch edit, then revert.
- **Unit, the guard of rule 4**: the exported-keys allow-list. Prove it goes red by
  adding a stray field to a dumped row.
- Unit: `deletedAt` absent → filled, not rejected.
- Unit: absent `complete` → replace allowed; `complete: false` → refused.
- Unit: the export self-check warns on an invalid dump and still returns the file.
- Unit: the fill runs on **both** validate calls of `chooseBackupFile` (the one
  with existing ids and the standalone one) — they parse the raw object twice,
  independently.
- e2e: the readable-file line is on screen; the replace button is hidden for a file
  declaring itself incomplete.
- **Manual, one step**: import the real file that failed on 2026-08-15. It is the
  only test that proves the point of the whole spec.

## Decisions taken

Both settled by Hernán on 2026-08-16, so no task in the plan has to stop and ask:

1. **The warning does not list the fields it filled.** "Este archivo venía de una
   versión anterior de CopyNotes y se completó" is all a person can act on; the
   field names go to the console, if anywhere.
2. **The "el archivo se lee con el Bloc de notas" line goes next to the download
   button**, not in the post-choice summary: the risk is created at download time,
   so the sentence has to be readable before the decision, not after it.
3. **The trash keeps travelling in the file** (same day). Rule 7's line has to name
   it for exactly that reason.

## Agent notes

- **Do not relax the schema.** It is the tempting one-line fix and it is measured
  wrong: `identical()` compares whole records, so a row let through unfilled
  duplicates on merge. Fill from `storage/shape.ts`, keep the schema strict.
- **Absent `complete` means complete.** Getting this backwards silently removes
  *Reemplazar todo* from every file already downloaded, and no test that only uses
  freshly built files would catch it.
- **One list, not two.** `storage/shape.ts` is the single source of the defaults.
  A second default list inside the validator is exactly how the shared pipe's
  version of this bug happened: two copies, and the one that got forgotten is the
  one that wrote the broken row.
- `validateBackup` and `shape.ts` must stay free of database imports. The node test
  project has no IndexedDB, and `export-import/*` is imported by pure modules on
  purpose.
- The fill must not touch content fields it cannot know: `title`, `content` and
  `html` already have defaults in `BIRTH_DEFAULTS` (`''`), which is correct — an
  empty row is a visible empty row, not a lost one — but nothing here may invent a
  value that looks like user text.
- The bug that opened this spec was found by a human at the end of a manual gate,
  weeks after the code shipped. Rules 3 and 4 exist so the next one is found by
  `pnpm test` in three seconds. If a task in the plan cannot show its guard going
  red, the guard is decoration.
