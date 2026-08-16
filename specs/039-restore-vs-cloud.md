# 039 - Restaurar un respaldo cuando la nube está encendida

Created: 2026-08-14, out of what Hernán hit while running the manual gate of spec
038. He did the ordinary thing — download a backup, delete his notes, import the
backup back — and the notes did not come back. Measured the same afternoon
against the real code; the numbers in "Objective" are that measurement, not an
estimate.

**Construida y con el gate manual pasado el 2026-08-16** (rama
`feat/nota-compartida`, sin subir). Las mediciones del gate están al final del
plan: 1758 → 1758 filas, `server_seq` 36976 → 40492, la bóveda intacta, cero
conflictos, y el segundo aparato al día sin que nadie lo tocara.

## En criollo (resumen para Hernán)

Guardás un respaldo. Borrás algo. Importás el respaldo con "Reemplazar todo".
**Y no vuelve.**

Lo que pasa por dentro: restaurar reescribe cada fila como si vos la acabaras de
escribir. Para la nube eso es indistinguible de "editó mil quinientas filas de
golpe estando sin conexión". Entonces el servidor rechaza cada una — "esa fila ya
la tengo" — y cada una queda estacionada como una pregunta para vos: *¿cuál de
las dos versiones querés?*

Con un respaldo de verdad son **unas mil quinientas preguntas**. Nadie las
contesta. El respaldo entra, queda inutilizable, y tu otro aparato ni se entera.

**No se pierde nada** — eso está medido y es importante. Pero un respaldo que no
te devuelve tus notas no es un respaldo, y ahí la app está rompiendo su promesa
más básica.

**Lo que propone esta spec:** que "Reemplazar todo" reemplace todo de verdad,
también la copia de la nube. Es lo que el botón ya dice que hace. Y que el cartel
avise que esto también le llega al teléfono que dejaste en la mesa, porque hoy no
lo dice.

## Objective

Make "Reemplazar todo" mean what its own confirmation text already promises, on a
device with cloud sync on: the file becomes the truth, on this device **and** in
the account.

Measured on 2026-08-14 against the current code (a fake server with the real
`push_records` refusal rule, `src/lib/sync/`):

| backup restored | rows uploaded | conflicts parked | other device converges |
|---|---|---|---|
| 5 notes + 20 blocks | 0 | **25** — one per row | no |

Nothing was lost: after five sync passes the five notes were still alive locally.
The failure is not data loss, it is that the restore is **inert and unusable**.

Scaled to Hernán's real file (47 notes, 1444 blocks, 13 snippets, 20 tags): about
**1500 parked conflicts**, and a number in the thousands next to the header dot.

## Why it happens, and why both halves are innocent

`replaceAllTables` (`storage/backup.ts`) clears the backup tables and writes the
file's rows. `LOCAL_ONLY_FIELDS` strips `changeSeq`, `cloudSeq` and `fromCloud`
on the way in — **correctly**, and spec 018 explains why: a file may not make
claims about a server. So every restored row lands as an ordinary local write
with a fresh stamp and no memory of the cloud.

From there, two mechanisms that are each doing exactly their job:

- **`push_records` refuses every row.** The row declares `base_seq: null` ("as far
  as I know this does not exist up there") and the server holds one, so the insert
  hits `on conflict do nothing` and comes back rejected. That refusal is the guard
  that stops a device from overwriting a version it never saw (AGENT.md), and it
  cannot tell a restore from a stale client.
- **`decide()` parks a conflict for each row.** The restored row is unsent
  (`local.changeSeq > uploadMark && local.cloudSeq !== local.changeSeq`), so the
  arriving server version is a genuine disagreement by its own contract, and
  parking it rather than dropping anything is the correct, conservative answer.

Neither is wrong. **A restore was simply never given a meaning of its own**: it
is the one operation where the user has already answered the question the
conflict machinery is about to ask, fifteen hundred times.

## What enters

### 1. A restore claims the account

After a successful "Reemplazar todo" on a device with cloud configured, a
session, and upload consent, the device empties the account's `records` and
uploads the restored state as the new truth.

This is not a new decision by the app: it is the decision the person already
confirmed. The dialog's own words today are *"Esto borra todas tus notas,
etiquetas y snippets actuales y los reemplaza por el contenido de X. No se puede
deshacer."*

### 2. `reset_records()`, and deliberately NOT `reset_cloud()`

A new `security definer` function that deletes **only** `records` for
`auth.uid()`, with the owner filter explicit inside like every other function in
`supabase/schema.sql`.

`reset_cloud()` must not be reused: it also drops `vaults` and `pairings`, so
restoring a backup would cost the account its vault proof and force every device
to be paired again with an 8-character code. Restoring a file is not "empezar de
nuevo la nube", and the two must stay separable — a person who restores a backup
has not lost their key.

It is the sibling of `delete_records(payload)` (spec 038): same shape, same
guard, no payload.

### 3. The order, and why a crash in the middle is survivable

1. restore locally (today's behaviour, unchanged)
2. `reset_records()`
3. upload everything from the restored device

Local first is the only order where a failure is recoverable and visible: the
device is restored and the cloud is stale, which the next sync pass or a second
attempt fixes. The reverse — empty the cloud, then fail to restore — leaves a
device with nothing and an account with nothing.

Step 3 is the ordinary uploader, not a special path: after step 2 there is
nothing up there to refuse a write, so every row inserts.

### 4. Zero conflicts, and that is the acceptance criterion

After step 2 the server holds nothing to disagree with, so nothing may be parked.
A restore that produces even one conflict has failed: the question was already
answered by the person who pressed the button.

### 5. The confirmation text has to say where this reaches

Today it names only "tus notas, etiquetas y snippets actuales", which reads as
*this device*. It must say, in plain Spanish, that the cloud copy and the other
devices are replaced too. A person has the right to know that this touches the
phone they left on the table.

Wording to write with Hernán; the sentence has to carry three facts: the file
wins, the cloud copy is replaced, and the other devices will follow.

### 6. What the other devices do, and why it is safe

Device B holds rows whose `cloudSeq` points at a server copy that no longer
exists. It will not re-upload them (they look already sent), and the refilled
rows carry higher `server_seq` values than B's cursor, so B downloads them and —
having nothing unsent — applies them. B converges without anyone touching it.

If B *does* have unsent work at that moment, that work is by definition not in
the file: its upload is refused and parked as a conflict, which is the honest
answer and the one case where a conflict is right. Worth one test.

## What does not enter

- **The trash.** Nothing in CopyNotes is ever destroyed — a delete is a mark —
  and yet there is no way to see or recover a deleted note from inside the app.
  That is the other half of the same broken promise and it fixes the *common*
  case better than any backup does, but it is a feature with its own screens and
  its own spec. Named here so it is not forgotten: it is the reason Hernán needed
  a person to edit a JSON file by hand.
- **"Importar y conservar lo mío"** (merge) keeps today's behaviour exactly. It
  is additive, it claims nothing, and its conflicts are real ones.
- **Restoring with no cloud** is unchanged and already correct.
- **Any change to `push_records`' refusal rule or to `decide()`.** Both are right.
  The fix belongs at the restore, not in the sync it confuses.

## Model of data affected

Server:

- `reset_records()` — new. Deletes `public.records where owner_id = auth.uid()`.
  Nothing else. `revoke`/`grant` like its siblings.

Local: no schema change. Two settings already exist and are read on the way
through — `syncUploadedThrough` and `syncDownloadedThrough`. The download cursor
may be left alone (the refill's `server_seq` values are higher than anything a
device has seen, because the sequence never rewinds); the upload mark likewise.
**Both must be verified rather than assumed**, and if either has to move, it moves
through `sync/leave.ts`'s existing writers and not a second copy of them.

## User flows

1. **Restore with the cloud on.** ⚙️ › Respaldo → Elegir archivo → "Reemplazar
   todo…" → the confirmation, now naming the cloud → the device restores, the
   account is emptied and refilled, the screen shows the file's notes, and the
   header dot shows no conflicts.
2. **The second device.** Untouched. Within a sync pass it shows the same notes.
3. **Restore with no cloud, or signed out.** Exactly as today: the file becomes
   the device's state and nothing else happens.
4. **The upload fails halfway** (wifi drops after `reset_records`). The device
   keeps the restored state and its rows stay pending; the next pass finishes the
   upload. The account is briefly emptier than the device, never the reverse.

## Acceptance criteria

1. Restoring a 25-row backup over a cloud that holds a different state parks
   **zero** conflicts (today: 25).
2. Every row of the file is present in `records` after the restore settles.
3. `vaults` and `pairings` are untouched by a restore: the device still holds its
   key and no device has to be paired again.
4. A second device converges to the restored state without any action on it.
5. A second device that had genuinely unsent work at that moment keeps it and
   raises a conflict for it — one, for that work, not one per row of the file.
6. `reset_records()` called by account A leaves account B's records standing
   (`scripts/rls-check.mjs`).
7. With no cloud configured, or signed out, the restore behaves exactly as before
   and reaches no network.
8. The confirmation text names the cloud and the other devices.
9. A restore that fails to upload leaves the device restored, not empty.

## Minimum tests

- **Unit, and it is the one that matters**: the measurement above, turned around.
  Seed, sync, delete, sync, restore, sync ×5 → assert `conflicts.count() === 0`
  and that the server holds every row. The current code fails this with 25.
- Unit: `reset_records` is called **after** the local write and **before** the
  upload (order assertion on the fake client, same shape as spec 038's
  `share-move.test.ts`).
- Unit: a restore with no session and no consent touches no client at all.
- Unit: the vault row and the pairing row survive a restore.
- `scripts/rls-check.mjs`: one account's `reset_records` does not reach another's.
- e2e: the confirmation text names the cloud.
- Manual, two devices: restore on A, B converges without being touched. This is
  the only one that proves criterion 4 end to end.

## Open decisions

1. **Should a restore be refused, or warned about, while another device is
   connected right now?** The live channel already knows (`syncStatus.peers`).
   Refusing is safer and more annoying; warning is honest and cheap. Hernán's
   call.
2. **Is there a "restaurar sólo en este aparato" option?** Today that is the
   accidental behaviour, and it is the one a person might actually want when
   testing something. If it exists it has to say out loud that the other devices
   will overwrite it back — otherwise it is a trap dressed as an option.
3. **What happens to a shared note (spec 038) during a restore?** The share mark
   is stripped from the file by design, and `list_shares()` re-establishes it on
   the next pass — but the restore uploads before that reconciliation unless the
   two are ordered. This spec must not be built before 038 part A lands, and when
   it is, the ordering rule of `syncNow` is the seam to check.

## Agent notes

- The temptation is to "fix" `decide()` or the refusal in `push_records` so a
  restore stops colliding. Both are load-bearing and were each written to close a
  real data-loss bug (AGENT.md). The restore is what lacks a meaning; give it one
  there.
- `replaceAllTables` already runs inside one transaction and already keeps the
  non-backup-safe settings across the clear. The cloud half must run **outside**
  that transaction — a network call inside a Dexie transaction commits it early
  (the trap `tasks/actions.ts` documents).
- The measurement that opened this spec is worth re-running rather than trusting:
  five notes, four blocks each, a fake server that refuses a null base against an
  existing row. It reproduces in under a second.
