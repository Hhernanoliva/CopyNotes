# 038 - Compartir una nota con otra persona (modo ticket)

Created: 2026-08-12. Designed with Hernán in chat the same day, starting from
"how could we share a note" and narrowing across the conversation from a public
link, to private multiplayer with per-line locks, to what is written here. The
sections "Why not a public link" and "Why not multiplayer" record what was
dropped and why, because both were on the table for a long time and both will
come back if nobody wrote down the reason.

Nothing here is built.

Reviewed against the actual code on 2026-08-12, before planning. Every claim the
spec made about existing files held up; five things it did not resolve were
found and fixed in place — the server owning the signature (§4), re-stamping
`changeSeq` and not only `cloudSeq` when a note changes pipe (§2), the derived
tick not counting as a change (§5), `list_shares()` (server functions), and the
bitácora tie-break that does not exist yet (§5). Section 10 was deferred and a
"Rollout" section added.

Reviewed a second time on 2026-08-12, deeper, still before planning. Seven holes
this round, and they are of a different kind: the first pass found things the
spec had not decided, this one found things the spec had decided **against the
code**. In order of cost — the tick's single door writes the block (§5); nothing
can delete a note's rows from `records`, and the server cannot even tell which
ones they are (§2); the owner's second device never learns the note moved (§2);
the shared pipe's gates are not the encrypted pipe's (§2); the cascade turns one
tick into N appends (§5); the derivation's place in the batch (§5); and the MCP
bridge as a second client (§4). Five smaller mismatches were corrected in place.
The per-note realtime channel was moved out of the first version.

Reviewed a third time on 2026-08-12, and this round has one root: **the row that
travels through the shared pipe is a projection, and every primitive that writes
an arriving row was built for a whole row**. `putFromCloud` replaces the stored
row (so an arrival erases the private fields — `notes.share` among them, which
puts the note back in both pipes), `sameToTheUser` compares the union of both
sides' fields (so an absent `folderId` reads as a disagreement and parks a
conflict), and `takeRemote` goes through `putFromCloud` too. That is §3b. Two
more: the per-note cursor had been put on the `notes` row, which is a synced row
with a stamping hook, so writing it every pass would have uploaded the note every
pass for ever; and `pending.ts`'s gate cannot be a `.filter()` predicate — that
callback is synchronous — and must not cover `tagAssignments`. The spec's claim
that a shared note is absent from the guest's backup was **false** against
`storage/backup.ts` and is now a filter that has to be built. Three product
questions were put to Hernán and decided the same day: the organisation freezes
while shared (§3), the guest's backup skips the note while shared (Local), and
deleting a shared note does reach the guest (§7).

Reviewed a fourth time on 2026-08-13, and this round's theme is that §5 and §8
each decided something the surrounding app cannot currently express. In order of
cost — the backup validator refuses a bitácora line without a block, so the first
"Listo" makes the owner's backups unrestorable (§8); the derived tick was ordered
by two devices' clocks and the spec called that a display concern, which it is
not (§5); the whole pre-share bitácora travelled, the owner's agent's writing
included, and the editor paints it on the guest's screen (§3); the "unsent
changes" line counts only the encrypted pipe, so a guest is told "Todo subido"
while their ticks wait (§2); the member branch cannot read `notes` from inside
`lib/tasks`'s transaction (§5); and the per-note `settings` keys need a declared
prefix, because the registry is a closed map and three other places walk it
(Local). Two product questions were put to Hernán and decided the same day: the
tick is decided by arrival at the server (§5), and a shared note's bitácora
starts blank (§3).

Reviewed a fifth time on 2026-08-13, and this round has a theme of its own:
**the spec describes almost everything from the owner's device, and the guest's
device is a second implementation of the app.** Five of the eight findings are on
the guest's side, and that side has no witness — the owner watches their own note
every day, the guest is a person who is not Hernán and who will not report a bug,
they will simply stop answering the ticket. In order of cost — the guest has to
write the `notes` row (§3 gives them their own organisation) and that row can
leave through neither pipe, which is §5's jam on a different row and triggered by
an ordinary sidebar drag (§3c); the shared pipe is a new untrusted-input boundary
and nothing sanitizes an arriving row, while `blocks.html` is an innerHTML sink
(§3b); `reset_cloud()` knows nothing about shares, so "empezar de nuevo" leaves a
note published on the server and back in the encrypted pipe (server functions,
flow 9); `list_shares()` has to run *before* the encrypted upload of a session,
which is the opposite of the order `upload.ts` argues for, and the window is
wider than the fourth pass thought (§2); a note arrives with no `sortOrder`,
`folderId` or `agentVisible` and lands at the bottom of the sidebar for ever
(§3); a third place renders `actor` and it is outside `src/` (§6); criterion 15
promised a papelera the product does not have (§7); and the whole spec adds two
row fields and a table without ever naming a Dexie version (Local). None of the
eight is new function. Criterion 16 now names the guest's organisation actions
explicitly, because with the rollout as it stands the only guest until the domain
lands is Hernán's own second account.

## En criollo (resumen para Hernán)

Mandarle una nota a otra persona como quien manda un ticket: vos escribís, la
otra persona responde.

- **El texto tiene un solo dueño: vos.** El invitado no puede reescribir tus
  renglones. Ni uno.
- **El invitado sí puede: tildar tareas y dejar comentarios**, y cada cosa que
  hace queda firmada con su nombre — el mismo mecanismo que ya usa el agente
  cuando toca una tarea por MCP.
- **No hay que "devolver" nada.** Es la misma nota viva: sus tildes y comentarios
  te aparecen solos. Lo único que se agrega es un botón **"Listo"** de su lado y
  un **contador de novedades** del tuyo.
- **La nota compartida sale de la bóveda.** Deja de estar cifrada mientras esté
  compartida, porque la otra persona tiene que poder leerla. El servidor sí puede
  leer esas notas. Se avisa en pantalla, en el momento de compartir, con esas
  palabras.
- **Hace falta que el invitado tenga cuenta.** El enlace no da acceso: da derecho
  a pedirlo, y queda registrado quién entró.
- **Sin tope por ahora.** La idea de "una gratis, más de una es de pago" está
  diseñada y queda guardada (sección 10), pero no entra en esta primera versión:
  todavía no hay nada que cobrar.
- **Quién hizo cada cosa lo decide el servidor**, no el aparato del invitado. Si
  su app mintiera y firmara con tu nombre, el servidor le pisa la firma.
- **Si los dos tocan la misma tarea, manda el que llegó último al servidor.** No
  se comparan relojes: el servidor le pone número a cada cosa cuando la recibe.
  Con los dos conectados es lo que cualquiera esperaría. Si alguien estuvo sin
  internet se da vuelta —lo que hizo el lunes sin conexión llega el miércoles y
  gana—, y se acomoda solo apenas cualquiera de los dos vuelva a tocar esa tarea.
  Nunca se pierde texto por esto: es una casilla.
- **El historial de la nota arranca en blanco al compartir.** El invitado recibe
  el texto y las tareas —las tildadas, tildadas—, pero no la historia vieja: ni
  lo que hizo tu agente en esa nota, ni las notas que le dejaste. La
  conversación empieza el día que compartís. Decidido el 13/8.
- **Las novedades llegan en hasta 30 segundos, no al instante.** El aviso en vivo
  por nota queda para más adelante: obliga a abrir un canal por cada nota
  compartida y se paga por mensaje. El reloj que ya tiene la app alcanza.
- **Mientras la nota está compartida, su carpeta y su lugar en la lista dejan de
  copiarse entre TUS aparatos.** Cada uno se queda con lo que ya tenía, no se
  pierde nada, y todo vuelve a acomodarse solo cuando cerrás la compartición.
  Decidido el 12/8: que viajaran igual costaba una tabla nueva y meterle mano a
  la sincronización que ya anda bien.
- **Si borrás la nota, se le borra también al invitado.** Quitarle el acceso NO
  le saca la copia; borrar la nota sí. Son dos botones distintos y la pantalla
  tiene que decir cuál hace cuál. Y "se le borra" es literal: CopyNotes no tiene
  papelera, así que la nota le desaparece de la lista sin aviso y sin vuelta
  atrás. Si eso se siente brusco, lo que falta es una papelera para todo el
  producto, no una excepción para compartir.
- **La nota compartida no entra en el respaldo del invitado** mientras esté
  compartida: la nota es tuya y su app la vuelve a bajar del servidor. Cuando
  cerrás la compartición, la copia le queda y desde ahí sí es una nota suya como
  cualquier otra.
- **Lo que NO entra**: que el invitado escriba en tus renglones, que agregue
  renglones, editar los dos a la vez, menciones `@`, avisos por mail, y compartir
  carpetas. Todo eso queda para después, y hay una sección que dice por qué.

Y la regla que hay que respetar toda la vida, escrita para que nadie la rompa
por accidente dentro de seis meses:

> **Una nota sale por UNA puerta. La cifrada o la compartida. Nunca por las dos.**

## Objective

Let one person hand a note to another so the second one can *respond* to it —
tick its tasks, leave comments, copy its lines — without ever being able to
rewrite the first one's text.

The narrow shape is the whole point. Two people typing into the same note is a
different product and costs weeks (see "Why not multiplayer"); two people where
only one writes prose costs a fraction, because **the only two things the guest
can do are the only two operations in this app that cannot collide**:

- Ticking a task is a yes/no. Two people who tick agree.
- Commenting appends a new row with a fresh `crypto.randomUUID()`. Two people who
  comment at the same instant produce two different rows.

Neither can conflict, online or offline, by construction and not by luck. That
property is what this spec is built on, and any change that lets the guest
*modify* an existing row throws it away.

### Why not a public link

The first design was a link anybody could open: the note published, encrypted
with a throwaway key riding in the URL fragment. It is cheap (1–2 days) and the
server stays blind. It was dropped because it answers a different question:
Hernán does not want to publish to the world, he wants to hand something to a
named person and get an answer back. A link with no identity cannot say who
ticked a box, and "who did this" is the feature, not a detail.

Worth keeping in the drawer: if a "publish read-only" need ever appears, that
design is written down in this conversation and is much smaller than this one.

### Why not multiplayer

The middle design was two people editing the same note, with a lock per line
held through the realtime presence channel and released on inactivity. It is a
sound design — it is roughly what Trello does with a card description — and it
was costed at ~3 weeks with real risk to the sync core.

It was dropped for a better reason than cost: **with the guest unable to write
prose, every problem the lock existed to solve disappears**. No turns, no
timeouts, no neighbour rule (delete/merge/indent of a line somebody else holds),
no "what does a lock mean offline". The lock was machinery to make a collision
survivable; removing the collision is strictly better than surviving it.

If two-handed editing is ever wanted, this spec is a foundation and not an
obstacle: the sharing pipe, membership, roles and identity are exactly what it
would need. What it would add is a write role plus the lock layer.

## What enters

### 1. A second pipe: shared notes travel in the clear

`records` keeps doing what it does: one opaque blob per row, encrypted with the
vault key, one owner. It is not touched.

Beside it, a new set of tables holds shared notes **in the clear**, scoped per
note and readable by the note's members. A note in this pipe is not encrypted at
rest on the server. That is a deliberate, user-visible privacy reduction and it
is the price of the feature (see "Privacy" below).

### 2. One note, one pipe — the rule that keeps `cloudSeq` meaningful

Every row carries a single `cloudSeq`: *the version the server already holds*.
`sync/pending.ts` decides what still has to go up with one line:

```js
const changedSinceCloud = (row) => row.cloudSeq !== row.changeSeq;
```

One stamp, one meaning. With two destinations that stamp becomes ambiguous —
*sent to which one?* — and the row either uploads twice or stops uploading.

The fix is not a second stamp. It is a rule: **a note belongs to exactly one
pipe at a time**, so the stamp keeps its single meaning and nothing about
`cloudSeq`, `changeSeq` or `fromCloud` changes.

Concretely:

- `sync/pending.ts` — the single door records leave through — skips a shared
  note's rows in the three shared tables: `notes` (by `id`), `blocks` and
  `activity` (by `noteId`). Shared rows leave through the shared uploader and
  nowhere else. It belongs in the same place as the consent gate for the same
  reason, but calling it "the mirror" of that one hides two things, because the
  consent gate is a boolean and this one is a lookup:
  - **It cannot be a `.filter()` predicate.** `listPendingUploads` and
    `countPendingUploads` filter with a synchronous callback, which cannot ask
    the database whether this row's note is shared. The set of shared note ids is
    read once per call, before the index ranges.
  - **It must not cover `tagAssignments`.** Those are the owner's private
    organisation: they do not travel through the shared pipe (§3) and they must
    keep travelling through the encrypted one, or the owner's second device loses
    the tags of every note they share. "Every row belonging to a shared note"
    reads as covering them, and it does not.
- Sharing a note **moves** it: its rows are pushed to the shared pipe, its
  `records` rows are removed from the server, and every affected row's
  `cloudSeq` is reset so the new pipe starts from a clean base.
- Unsharing moves it back the same way, in the opposite order.
- **Resetting `cloudSeq` is not enough, in either direction.** `pending.ts`
  reaches a row through `.where('changeSeq').above(mark)` — the global "uploaded
  through" mark — *before* `changedSinceCloud` ever runs. A note coming back to
  the encrypted pipe carries old `changeSeq` values that sit below that mark, so
  the index range never yields them and the note silently stops syncing: exactly
  the failure this section exists to prevent, arriving through the door above the
  one it was watching. The move must therefore **re-stamp `changeSeq` on every
  affected row** (an ordinary local write, which is honest: the destination pipe
  has never seen that row). The same applies to the shared uploader's own cursor.
- The move is sequenced so a crash in the middle leaves the note in one pipe or
  the other, never in both and never in neither. Removing from the old pipe is
  the LAST step: a note briefly present in both is a duplicate (recoverable); a
  note present in neither is a note that has stopped syncing (silent).
- **Removing the note from `records` needs a server function that does not exist,
  and the server cannot write it on its own.** `records` grants `select` and
  nothing else — the only delete in the whole schema is `reset_cloud()`, which
  empties the entire account — and every row up there is an opaque blob whose
  `noteId` lives *inside* the envelope. So the server cannot answer "which rows
  belong to note X". The client can, and therefore sends the list: a new
  `delete_records(payload)` beside the others, with the owner filter explicit
  inside like every other `security definer` function here. Nothing else in the
  move can be built before it.
- **The owner's other device does not find out by itself.** A hard delete leaves
  no tombstone, and the download advances by cursor, so device B never sees those
  rows go. While nobody touches the note there it is harmless: B's rows are
  marked as already uploaded, so they are not pending and are not re-sent. But an
  edit made on B *before* it next calls `list_shares()` becomes pending in the
  encrypted pipe and uploads, and from that moment the note is in both. The
  invariant is enforceable per device, not per account. `list_shares()` is what
  closes the window, and its reconciliation must **delete the stray `records`
  rows** rather than assume there are none. Acceptance criterion 7 is worded to
  say exactly that, instead of promising something two devices cannot guarantee.
- **And that window is wider than an edit, so `list_shares()` runs BEFORE the
  encrypted upload of a session.** The point above says "an edit made on B before
  it next calls `list_shares()`", which reads as a rare race. It is not:
  `notes.share` is *absent* on a restored device (it is not backup-safe, see
  Local), on a device that has never seen the share (criterion 9), and after any
  sign-out — and `resetCloudState` (`sync/leave.ts`) clears `cloudSeq` on every
  row of every synced table, which makes `changedSinceCloud` true for all of
  them. On those devices the whole note is pending **with nobody editing
  anything**, and the first upload after consent returns sends it up `records`.
  So the reconciliation is an ordering constraint on `syncNow`, not a background
  job: it runs before `uploadBatch`, at least once per session. `sync/upload.ts`
  documents the opposite order in a comment ("Upload first, so my own records
  come back as an echo"); that reasoning is about the encrypted pipe and stays
  true — this is a step in front of it, and the comment has to say so or the next
  reader will move it back. Note also that `syncNow`'s whole upload half lives
  inside `if (gate)`, `lastUploadAt` and `nudgePeers()` included: whatever the
  shared pipe needs at upload time is lifted OUT of that block, never added
  inside it.

This rule applies on the guest's device too, mirrored: a shared note on the
guest's machine is an ordinary local row that their own vault would happily
upload. It must not. Same gate, same reason.

**The shared pipe's gates are not the encrypted pipe's.** `syncNow` runs behind
four (cloud configured, session, upload consent, vault key), and the last two
exist because `records` is encrypted with a key this device may not hold. A
shared note travels in the clear and needs neither: a guest who never consented
to upload their own notes, and never created a vault, must still receive the
ticket and answer it. The shared loop's gates are cloud configured, session, and
membership — and sharing a note *is* the consent for that note, asked for on the
sharing screen at the moment of sharing. Do not reuse `ready()`; write the shared
pipe's own gate next to it, and say why in the same place.

**And the screen has to count both queues.** `DataStatus.svelte` shows
`syncStatus.pending`, which is `countPendingUploads()`, which returns 0 before
upload consent — by design, and correctly, for the encrypted pipe: that is the
consent gate doing its job at the only door records leave through. A guest has
no consent and no vault, so the line reads "Todo subido" while five ticks sit
unsent on their machine. It is not a cosmetic gap: that line is the only witness
the two-device gate has (`docs/`, the manual gate method), so criterion 16 cannot
be run against a screen that lies. `syncStatus.pending` adds both queues, and the
shared one answers without asking about consent.

### 3. Shared content, private organisation

A shared note is **not "the same row in two accounts"**. It is shared content
plus each side's own private organisation.

Only an explicit allow-list of fields travels through the shared pipe:

| Table | Fields that travel |
|---|---|
| `notes` | `id`, `title`, `updatedAt`, `deletedAt` |
| `blocks` | `id`, `noteId`, `parentBlockId`, `order`, `type`, `content`, `html`, `checked`, `dueDate`, `deletedAt` |
| `activity` | `id`, `blockId`, `noteId`, `actor`, `action`, `text`, `seq`, `at`, `deletedAt` |

`changeSeq` is deliberately on none of the three. It is the version stamp, and it
rides as a **column** of `share_rows` exactly as it rides as a column of
`records`; the download re-attaches it to the row on the way in, which is one
line `sync/download.ts` already has — the re-attachment is that line, the write
underneath it is *not* the same one (§3b). An earlier draft of this table had it inside
the payload for two of the three tables and not the third — the kind of asymmetry
that gets read as a decision six months later.

**Anything not on that list does not travel — including fields added later.**
The allow-list is a deny-by-default contract, the same shape as
`format/sanitize.ts` and for the same reason: the failure mode of a deny-list is
a leak nobody notices.

What deliberately stays home, and what breaks if it travels:

- **`notes.folderId`** — points at a folder that does not exist on the other
  device. `AGENT.md` already forbids producing a row the user cannot reach.
- **`notes.agentVisible`** — the owner's decision about *their* MCP agent. If it
  travelled, the guest would switch the owner's agent access on and off.
- **`notes.sortOrder`**, the note's place in the sidebar (and anything like
  pinned or archived added later) — two people pushing the same field. And
  `storage/row-compare.ts` deliberately does **not** exclude `order` from
  "is this the same to the user", so every sidebar reorder on one side would
  raise a conflict for a human to decide on the other. That is the silent
  conflict avalanche that Enter-renumbering already caused once.
- **Tags and tag assignments** — the owner's private organisation, and
  assignments would point at tags the guest does not have.
- **`blocks.collapsed`** — same class as the sidebar order, one level down: it is
  how *this* reader is looking at the tree, not what the note says. If it
  travelled, collapsing a branch to read would fold it under the other person's
  cursor, and the two would push the field back and forth.
- **`blocks.note`** — the owner's private comment on a block. Deny-by-default
  already keeps it home; it is named anyway because it is the most sensitive
  field on the row. `bridge/export.ts` discards it by hand and calls that "the
  second lock for comments", and a field with two locks should not depend on a
  reader noticing it is missing from a list.
- **`blocks.createdBy`** — whether this device's owner or their agent typed the
  line. A fact about the author's tooling, not about the note.
- **Snippets, folders, settings** — not part of a note.

- **`createdAt`** — not on either allow-list, so the guest's copy has none. The
  guest's side fills it in locally when the note lands, the same way any locally
  created row gets one. "When did this note come into existence" is not a fact
  about the note, it is a fact about a device's copy of it. **And it is not the
  only one**: `createNote` (`storage/notes.ts`) mints four fields no arrival can
  carry — `createdAt`, `sortOrder`, `folderId` and `agentVisible` — and creation
  is the only place in the app that mints them. A note arriving through the
  shared pipe never goes through it. `sortOrder` is the one that shows: a row
  without it sorts **last** (`organize/plans.ts`, `sortBySidebarOrder`) and stays
  last for ever, because `normalizeSidebarOrder` only runs after a backup
  restore, never after a download. So the shared download's *insert* case (there
  is no local row to merge onto) fills all four with exactly what `createNote`
  would have given them: `topSortOrder('note')`, `folderId: null`,
  `agentVisible: false`, `createdAt: now()`. This is the insert case only — an
  arrival onto an existing row must not touch them (§3b, criterion 13).
  **`blocks.updatedAt`**
  is off the list for the same reason, while `notes.updatedAt` is on it — that
  asymmetry is deliberate and this is where it is written down: the note's
  timestamp is what both people see ("modificada hace un rato") and it has to
  agree, a block's is bookkeeping nobody reads.

**The bitácora starts blank, and that is about rows, not fields.** Every rule
above is an allow-list of *columns*; this is the one place the question is which
*rows* go at all. A note's history holds what the owner's MCP agent wrote on
those tasks — its summaries, its explanations of what it could not finish — and
`editor/agent-notes.ts` groups exactly those rows (`action: 'note'`, filtered by
`actor !== 'user'`) and the editor paints them on the block. Shipped as first
designed, the guest opens the note and reads the owner's agent talking to the
owner, on the line. That is the same class of private text as `blocks.note`,
which this spec guards with two locks and calls the most sensitive field on the
row, so guarding one and handing over the other was an inconsistency rather than
a decision.

Decided with Hernán on 2026-08-13: **the shared uploader sends only `activity`
rows written after the share opened.** The mark is stamped when `open_share`
succeeds and lives with the other per-note values (Local); one filter, in the
uploader, beside the client-side mirror of every other rule here.

Two consequences worth writing down. The guest's copy of an old task arrives
with no entries at all, which is fine and not a special case: `blocks.checked`
is on the allow-list and travels, and §5's derivation only overrides that cache
where entries exist — where there are none there is nothing to disagree with.
And the owner's own screen is untouched: their rows never left their device, so
their history is whole.

Note the distinction that matters and is easy to get backwards: **`blocks.order`
travels** (it is the note's internal structure = content); **the note's order in
the sidebar (`notes.sortOrder`) does not** (that is organisation).

**The price of the split, decided with Hernán on 2026-08-12: while a note is
shared, its organisation stops syncing between the owner's own devices.** The
`notes` row has left the encrypted pipe (§2) and the shared pipe does not carry
`folderId`, `sortOrder`, `agentVisible` or the tag assignments. Nothing is lost —
each of the owner's devices keeps the values it already had, because an arrival
merges instead of replacing (§3b) — but the *change* does not propagate: move a
shared note to another folder on the laptop and the phone will not know until the
share closes. The alternative offered was splitting a note's organisation into a
second row with its own `cloudSeq` so it could keep travelling by the encrypted
pipe: a new table, a migration and surgery on the sync that works, for a field
nobody edits twice a day. Acceptance criterion 6 says "unchanged on their
device", singular, and that is now deliberate rather than sloppy.

### 3b. An arriving shared row is merged, never written over

Everything in `sync/` that writes a row coming down was built for the encrypted
pipe, where the payload **is** the whole row. A shared payload is a projection of
it, and each of those primitives breaks differently against a projection:

- **`putFromCloud` (`storage/db.ts`) does `table.put(...)`, which replaces the
  stored row.** Applying a shared payload with it on the owner's *other* device
  erases `folderId`, `sortOrder`, `agentVisible`, `blocks.note`,
  `blocks.collapsed`, `createdBy` and `createdAt` — and, fatally, `notes.share`:
  the note stops being marked as shared, so the next pass hands it to
  `pending.ts`, which no longer has a reason to skip it, and it goes up the
  encrypted pipe. §2's invariant destroyed by §3's download, in silence, on the
  device that was not even looking at the note.
- **`takeRemote` (`sync/conflicts.ts`) calls the same `putFromCloud`**, so
  resolving a conflict does it too. It also has to know which pipe the parked
  conflict came from, because the answer changes which write it uses.
- **`sameToTheUser` (`storage/row-compare.ts`) walks the union of both sides'
  fields.** A local `folderId` against an absent remote one is "not the same to
  the user", so the owner's second device parks a conflict over a difference that
  is by design — one per row, on every note they share.

So the shared pipe gets its own two lines, written next to the originals and not
in place of them:

- a **merge** write — `{ ...localRow, ...allowListedFields }`, setting `cloudSeq`
  and the `fromCloud` flag exactly as `putFromCloud` does;
- a **comparison scoped to the allow-list**, which is the only honest reading of
  "the same to the user" when half the row was never sent.

The rule to carry: before reusing anything from `sync/` on the shared pipe, ask
what it does with a field that is simply absent.

**And the merge write cleans before it merges, because this is a new trust
boundary.** `format/sanitize.ts` carries a written contract naming every write
boundary that must pass through it: "editing, internal paste, backup import,
snippet insertion via format/ingest.ts". The cloud download is deliberately
absent from that list, and it was right to be: in the encrypted pipe the payload
was written by one of *your own* devices, with *your own* key, and was already
sanitized on the way in there. A shared payload is markup written by **another
account's client**, and `blocks.html` is on the allow-list and is an innerHTML
sink (`editor/BlockRow.svelte`, and the warning already written in
`blocks/selection.ts`). The rule this project applies to a backup file —
"un archivo es sospechoso lo escriba quien lo escriba" (`export-import/schema.ts`)
— applies here word for word, and being invited by somebody is not a reason to
run their markup. `blocks.type` and `blocks.dueDate` ride along for the same
treatment: the gate normalizes both (an unknown type falls back to `text`, an
impossible date to null), and both reach the editor and the Agenda unchecked
otherwise. So the merge write is `{ ...localRow, ...clean(allowListedFields) }`,
where `clean` is the existing gate applied to the projection — the same shape as
`sanitizeBackupData`, not a second copy of the allow-list. The guest's own
writes need no such pass: `activity.text` is plain text and is rendered escaped.

### 3c. The guest's `notes` row is written locally and can leave through no pipe

§3 hands each side its own private organisation, which means **the guest writes
the `notes` row**: they file the note in a folder of theirs, they move it in
their sidebar, and §4 says out loud that they may switch their own agent's
visibility on. All three go through `updateNote` / `applySidebarUpdates`, and
`db.ts`'s stamping hook raises `changeSeq` on every one of them.

That row cannot go anywhere. The encrypted pipe skips it (§2, mirrored on the
guest's device) and the shared pipe refuses it by role (§4: a member may write
`activity` and nothing else). It is pending for ever — and if the shared
uploader's cursor has the shape `pending.ts`'s does, one unsendable row **drags
that cursor back on every pass**, which stops the guest's ticks and comments from
reaching the owner at all. The symptom is not an error on screen: it is a person
who answered the ticket and whose answers never arrived. Their own notes are
unaffected; those travel by their own encrypted pipe, which never sees this row.

This is §5's jam, on a different row, reached by dragging something in a sidebar.
It takes §5's fix, and the same one twice: **on a note where this account is a
member, an organisation write goes in with the `fromCloud` flag** — the value
lands, the screen updates, the counter does not move. Two seams rather than one,
because organisation is written from two places: `updateNote` (folder, agent
visibility) and `applySidebarUpdates` (`storage/organize.ts`), which writes many
rows inside one transaction and is handed updates that do not say which note they
belong to. As in §5, "is this account a member" is resolved by the caller before
the transaction opens and passed in.

The owner has no equivalent problem and it is worth saying why, so nobody
"fixes" both sides: the owner's `notes` row does travel — its allow-listed half
does — so a folder change on their side merely re-sends a payload identical to
the last one. Wasteful, harmless, and it keeps their cursor moving.

### 4. Two roles, and the guest's is "append only"

- **`owner`** — writes everything, exactly as today.
- **`member`** — may append to `activity` and nothing else.

The guest never modifies an existing row. Not `blocks`, not `notes`, not even
their own earlier comment. That is what makes collisions impossible rather than
rare, and it is enforced **in the server function**, not in the UI. The client
also disables editing, but that is courtesy: the boundary is the SQL.

**The signature is the server's, not the payload's.** `actor` rides inside the
row the client sends, so a member could put `actor: 'user'` in it and sign the
owner's name to their own tick. "Who did this" is the whole feature, so it may
not be self-declared: `push_shared_rows` **overwrites** `actor` with
`'member:' || auth.uid()` on every row a non-owner writes, and stamps
`author_id = auth.uid()` the same way `push_records` stamps `owner_id`
explicitly. The screen renders the name from `author_id`. Whatever the payload
claimed is discarded before it is stored, not validated and rejected — there is
no legitimate case for a client choosing its own signature.

**"The client" is two clients.** The screen is one. The MCP bridge is the other,
and there the word "courtesy" is wrong: `bridge/ingest.ts` lets an agent create
tasks and write text. The default happens to be closed — the note lands on the
guest's device without `agentVisible`, and the export filters on `=== true` — and
that is luck worth keeping rather than a design. The guest can switch it on, and
their agent would then write block rows that can never leave (the jam in §5). The
ingest gate gets the same branch the UI gets: on a note where this account is a
member, complete and comment only.

This is the same permission shape the app already grants its MCP agent — see the
whole note in "Agent notes". Reusing the shape, not the code, is what keeps the
product coherent instead of holding two different ideas of "a second party".

### 5. The tick is derived from the bitácora

Ticking a task the obvious way *modifies a block row*, which is precisely what
the guest may not do — and if it were allowed, a tick landing while the owner
types on that same line would be refused by version control and parked as a
conflict for a person to resolve. Frequent and pointless.

Instead: **the guest's tick is an `activity` append** (`done` / `reopened`, which
`lib/tasks` already writes), and `block.checked` is *derived* from the last such
entry for that block, applied locally on each device.

**But the single door writes the block.** `lib/tasks/actions.ts` — the door this
spec insists on reusing — updates `block.checked` through `updateBlock` *and*
appends the bitácora line in one transaction, on purpose: a task must never be
mutated without its trace. So a guest ticking through that door writes a block
row, its `changeSeq` rises, and that row is pending for ever — the server refuses
it by role, and no conflict screen resolves a refusal that is a *permission*
rather than a disagreement. Worse than one stuck row: every pass drags
`syncUploadedThrough` back below it (`sync/upload.ts`), so it is a stuck cursor.

Two guards, and both are built:

> **Superseded, measured 2026-08-17.** The first guard already exists —
> `listSharedPending` filters by role — and the stuck *cursor* this paragraph
> fears does not: `pushSharedNote` marks row by row and carries no cursor. Only
> the `fromCloud` flag of the second guard survives, and for a different reason.
> See "Part B2 — design decisions", point 3.

- The shared uploader hands up **only `activity` rows** when this account is a
  member of the note. This is the one a caller added later cannot forget, and it
  is the client-side mirror of the SQL check.
- `lib/tasks` writes the block with the `fromCloud` flag when the account is a
  member, so the tick shows on screen at once and the counter never moves. The
  door stays single; it gains one branch.

**And that branch may not ask the database.** `setTaskChecked` and `traceWrite`
run inside `db.transaction('rw', blocks, activity)`. `notes` is not in that
scope, and a chained read wrapped in `trackPendingWrite` escapes Dexie's
transaction zone and commits it early — the `PrematureCommitError` `createTask`
already carries a comment about, and solves the same way. "Is this account a
member of this note" is resolved by the caller *before* the transaction opens and
passed in, exactly as `createTask` passes `order`.

**A tick is not one append — the cascade makes it N.** `setTaskChecked` applies
spec 003's cascade: ticking a parent ticks its todo children and mirrors up
through its todo ancestors, writing one block change *and one bitácora line* per
affected task. The derivation reproduces that correctly, because there is an
entry per block, so nothing has to change. It is written down because "one tick,
one append" appears all over this spec and is false, and a plan that budgets one
row per tick will be surprised by a note that ticks fifteen.

**The derivation runs at the end of the batch, not per row.** One download can
carry the owner's block row (with their older `checked`) and the guest's bitácora
entry in the same pass; applying them row by row makes the answer depend on their
order inside the batch. Apply the batch, then derive once over the blocks it
touched.

**Two orders, because one number cannot do both jobs.** `seq` is
`nextChangeSeq()`, which is `max(now, last + 1)` — the clock. Across two accounts
that is two clocks, and the paragraph above makes that ordering decide a *value*:
a guest whose clock runs two minutes behind unticks at 10:00 and loses to an
owner's tick from 09:59:30, on both devices, silently. An earlier draft called
this "a display order, not a correctness property". That sentence is true of a
comment and false of a tick, and it was being applied to both.

Decided with Hernán on 2026-08-13: **the tick is decided by the order the server
received the entries** (`server_seq`), never by `seq`. No clock is involved and
there is nothing to reconcile between two of them. An entry this device has not
uploaded yet has no `server_seq` and sorts **last**, which is both correct (it
has not arrived, so nothing can have arrived after it) and what the person
expects — the tick they just made shows at once and does not flicker when it
lands.

What that buys and what it costs, written down so it is not rediscovered as a
bug: with both sides online, the last one to touch the task wins, which is what
anyone would predict. After a long offline stretch it inverts — a guest who
unticks on Monday with no connection beats an owner who ticks on Tuesday,
because the guest's entry reaches the server on Wednesday. It self-heals the
moment either side touches the task again, and only a checkbox is at stake; no
text can be lost this way.

The bitácora is still **displayed** in `seq` order — what `listActivityByNote`
already does and what the person reads — and there **the `id` tie-break has to be
added**: `bySeqAsc` (`storage/activity.ts`) has none today, on purpose, because
`seq` came from one device's monotonic counter and could not tie. Two accounts
are two counters reading the clock, so from now on it can. Add the tie-break to
that comparator; do not remove the comment explaining why the old random one was
taken out. The derivation needs no tie-break of its own: `server_seq` is a
Postgres sequence and cannot tie. Two clocks can still put two comments a few
seconds out of their true order in the displayed list, and *that* is the case
where "a display order, not a correctness property" was right all along.

The owner's own ticks keep writing `block.checked` directly, as today — and that
field is on the allow-list, so it travels. The two are not rivals: `completeTask`
already writes the block **and** appends the bitácora entry, so every tick from
either side leaves an entry, and both devices derive the same answer from the
same ordered list. `block.checked` is then a cache of that answer, and the rule
when they disagree is that **the bitácora wins**.

**Writing that cache must not count as a change.** An ordinary `updateBlock`
raises `changeSeq`, which queues the block for upload; the other side downloads
it, re-derives, writes its own cache, and the two bounce the same row between
them for ever. This is the identical trap `putFromCloud` was built for, and it
takes its shape: the derived write goes in with the `fromCloud` flag the db.ts
hooks consume, so the row updates on screen and the counter does not move. The
derivation runs once where the bitácora arrives (the shared download), not at
render time — deriving on read would mean every existing caller of
`block.checked` (the cascade, copy, export, the MCP export, search) needs to
learn about sharing, and that is the whole app instead of one function.

### 6. `actor` becomes an identity

`storage/activity.ts` already carries the field, today `'user' | 'agent'`:

```js
appendActivity({ blockId, noteId, actor, action, text })
```

It gains a third form, `'member:<uuid>'`. Display names are cached locally in a
**non-synced** Dexie table filled from the shared pipe's read call; they are not
content and must not travel as rows.

**Where the name comes from — decided with Hernán on 2026-08-16.** The plan for
part A left this open, and the obvious answer was the account's email, which is
what every comparable product shows. It is not what ships. **The owner writes the
name when they create the invite** ("¿para quién es este link?" → "Juan"), and
`accept_share_invite` copies it onto the membership row. No email is exchanged in
either direction, which is the same promise the rest of the product makes, and it
costs one text field on a screen that has to exist anyway. The two rejected
options are worth recording: the email leaks an address in both directions and a
forwarded link tells the owner who accepted it, and a self-chosen nickname lets a
guest sign somebody else's name — the one thing §4 spends a server-side overwrite
to prevent, given back for free at the label.

**The consequence that is easy to miss: the guest needs a name for the OWNER
too.** On the guest's device an `actor: 'user'` entry is the owner's, and
`actorLabel()` renders that as `'Vos'` today — so without a second name the
guest's screen would credit them with everything the owner did. It is the same
field seen from the other side, and the implementation plan has to say where the
owner's own label is set and what it falls back to when they never set one.

`SettingsDialog.svelte` holds two `ACTION_LABEL` maps because the user and the
agent conjugate differently in Spanish. A member conjugates like the agent
(third person), so the existing agent map covers it with the name substituted.
The name itself is the half that does not exist: `actorLabel()` returns a bare
`'Vos'` or `'Agente'` today, with nothing to substitute into. It gains the member
case and reads the cached display name.

`editor/agent-notes.ts` is the other half, and it is where the guest's comments
actually get read — on the line, in the note, with no new screen to build. It
groups `action: 'note'` rows by block under one filter, `actor !== 'user'`, which
was written when "not the user" had exactly one meaning. A member's comment
therefore lands in the right place for free and lands there **as the agent**: the
owner reads "Agente: llamá al contador" and never learns Juan said it. The actor
has to travel through that grouping and the panel has to render the name. Free
placement, not a free feature.

**There is a third place, and it is outside `src/`.** `mcp/lib/tools.js` renders
a task's history for the agent with the same two-way split
(`entry.actor === 'user' ? 'usuario' : 'agente'`), so a member's comment reaches
the owner's agent labelled as the agent's own earlier note — the one place where
something *acts* on the label instead of displaying it, and an LLM reading its
own name on somebody else's instruction is a worse outcome than a wrong word on a
screen. It sits in the `mcp/` workspace, which is why two passes over `src/`
missed it. Beside it, `bridge/export.ts` ships whole `activity` rows into
`export.json`, so the agent receives a bare `member:<uuid>`: the display-name
cache is a Dexie table the MCP server cannot read, so the **name has to be
resolved on the way into the export**, not looked up by the reader.

### 7. Invitation by link, access by account

- The owner generates an invite link with a random token and an expiry.
- **The link grants nothing.** Opening it while signed out leads to sign-in or
  sign-up; accepting it while signed in creates the membership row and records
  who accepted. This is what makes "who ticked this" answerable at all.
- One membership per note per account. Re-accepting is a no-op.
- The owner sees the list of members and can remove any of them.
- Removing access stops the sync. **It cannot remove the copy already on the
  other person's device**, and the UI says so in those words before confirming.
- **Deleting the note is a different act, and that one does reach them.**
  `deletedAt` is on the allow-list of all three tables, so a soft delete travels
  like any other version and the note **disappears from the guest's list**. Not
  "lands in their papelera": CopyNotes has no papelera. `softDeleteNote` hides
  the row and there is no screen anywhere that lists or restores hidden ones, so
  for the guest the note vanishes with no notice and no way back. That is the
  honest description of what ships, it is what the two sentences on screen have
  to be written against, and if it is ever felt to be too abrupt the answer is a
  papelera for the whole product, not a special case for sharing. Decided with
  Hernán on 2026-08-12: it is what "I deleted it" is expected to mean, and it
  costs nothing — leaving it out would mean taking `notes.deletedAt` off the
  allow-list while `blocks.deletedAt` stays on it (deleting a line inside the
  note has to travel or the two copies drift), and handing the guest a live note
  that no longer exists for the owner and never receives anything again. The two
  sentences on screen must not be confused with each other: *removing access*
  leaves their copy, *deleting the note* takes it.

### 8. "Listo" and the news counter

The two halves of "how does the ticket come back", which is otherwise a question
with no answer because nothing has to physically return:

> **The two halves ship apart.** "Listo" moved into B2 and gained an optional
> text line; the news counter stays in B3. See "Part B2 — design decisions".

- **"Listo"** — a button for the member that appends one `activity` entry to the
  note. It is a statement, not a state machine: no workflow, no approval, no
  reopening ceremony. The owner reads it in the bitácora like any other line.
  Two things it needs that the code does not have yet. It is an entry **about the
  note**, and `appendActivity` takes a `blockId` on every call — a null one is
  not a valid IndexedDB key, so the row simply stays out of that index and is
  read by note, which is exactly what this wants, but it has to be said out loud.
  And it is a fifth `action` beside `created` / `done` / `reopened` / `note`, so
  it needs its word in **both** `ACTION_LABEL` maps: they are closed maps and an
  unknown action renders as its own raw name on screen.

  And a third thing, the one that costs a restore. `export-import/schema.ts`
  validates `activity.blockId` as `v.string()`, so a backup file containing one
  note-level entry fails validation — and `validateBackup` rejects the **whole
  file**, not the row: an error, not a warning. Past that, `dropDanglingActivity`
  drops every entry whose `blockId` is not a known block, and a null never is, so
  the "Listo" would vanish with a warning instead. Both have to change
  (`v.nullable(v.string())`, and skip the block check for a note-level entry) or
  the first "Listo" quietly makes the owner's backups unrestorable — which they
  find out on the day they need one. An old CopyNotes cannot read such a file
  either way, and bumping the format version does not help: it would refuse it by
  version instead of by field. Acceptance criterion 17 covers the round trip.
- **News counter** — each device stores, per shared note, the highest `activity`
  `seq` it has displayed. The sidebar shows the count of newer entries. Local
  and per device, never synced (it is "what *this* screen has shown").

### 9. Undo keeps the live `checked`

`restore` → `putBlock` already preserves the live row's `cloudSeq` rather than
the one inside the snapshot, because bookkeeping must not travel back in time.
`checked` gets the same treatment for shared notes: undo restores the text as it
was and leaves the current tick alone.

Without it, every guest tick makes the owner's undo history stale (a row arrived
different), and the owner loses their undo stack several times an afternoon. With
it, the history survives and Ctrl+Z can never un-tick somebody else's tick and
push that back up.

The seam to watch: `putBlock` receives a block, not a note, and the editor calls
it in a loop over the diff. "Is this note shared" has to be resolved once by the
caller and passed down — not read from the database once per row, in the editor's
hottest write path.

### 10. One free share, counted by the server — DEFERRED, not in the first version

Decided with Hernán on 2026-08-12: **this does not ship with the rest.** Nothing
is being paywalled yet, there is no billing, and the accounts that exist are his
own, so a limit today only buys a table, a server branch and a screen that
protect against nothing. It is the first paid-plan seam in the product and that
seam should open when there is a plan to sell.

The design stands as written, for when it comes back:

- A free account may have **one** open share at a time. Updating the shared note
  does not consume another; closing a share frees the slot immediately. Being a
  *member* of somebody else's share consumes nothing — the limit counts shares
  you own.
- The count is enforced inside `open_share`, server-side. A limit the client
  counts is not a limit.
- A minimal `profiles (id, plan)` table, written only by the server (set by hand
  for now), answers "is this account paying".
- Hitting the limit is not an error dialog: it names the note currently shared
  and offers to replace it, next to the Pro option.

The first version has **no limit and no `profiles` table**. Adding it later
touches `open_share` and one dialog; nothing else in this spec depends on it.

## What does not enter

- **The guest editing block text.** The invariant the whole design rests on.
- **The guest adding rows.** It sounds harmless ("just at the end") and
  immediately raises "in the middle? indented? under one of the owner's tasks?",
  which re-opens who owns the text. If the guest needs to add something, they
  comment and the owner promotes it.
- **Per-line locks, turns, presence, live cursors.** See "Why not multiplayer".
- **`@mentions`, assigning tasks to people, an "assigned to me" screen.** These
  need a user directory and are a workflow product. Deliberately deferred until
  this spec has been used for real for a few weeks — mentions designed without
  use get designed wrong.
- **Email or push notifications.** The news counter is the whole notification
  system for now.
- **A live channel for shared notes.** Deferred, not dropped — the reasoning is
  under "Realtime" in the server model. The shared pipe rides the same 30-second
  clock as everything else.
- **Sharing a folder.** The container question was considered (it is what Trello
  does with boards) and deferred. But membership is modelled per note in a way
  that can later hang off a folder without reshaping it.
- **Sharing a branch of a note.** Never. Permissions nested inside the block
  hierarchy make "who can see this?" unanswerable and produce half-visible notes.
- **Billing.** Only the seam the limit needs.

## Model of data affected

### Server (new, alongside `records`)

All of it lives in `supabase/schema.sql` next to what is there. Names are
indicative; the shapes and the rules are not.

- **`shares (note_id text primary key, owner_id uuid, created_at)`** — one row
  per shared note.
- **`share_members (note_id, member_id, role, joined_at, primary key (note_id, member_id))`**.
- **`share_invites (token text primary key, note_id, owner_id, expires_at)`** —
  one live invite per note; requesting a new one replaces it. Expiry is a server
  rule, like `pairings`.
- **`share_rows (note_id, table_name, id, change_seq, deleted, payload, author_id, server_seq, primary key (note_id, table_name, id))`** —
  the allow-listed fields of a shared row, in the clear. `server_seq` is the
  per-note download cursor and works exactly like the one in `records`,
  **including the backwards overlap** on read: the sequence is handed out when a
  write starts, not when it commits, so two writers can make it visible out of
  order. Re-read a window, do not trust a strictly forward cursor. It carries a
  second job since the fourth pass: it is also the order §5's tick derivation
  sorts by. The out-of-order visibility above does not weaken that — the numbers
  still form one fixed total order every device reads the same way, which is the
  whole property the derivation needs. `pull_shared_rows` therefore has to
  **return** it, not only consume it.
- **`profiles (id uuid primary key, plan text)`** — deferred with section 10, not
  created in the first version.

Functions, all `security definer` with **explicit owner/member filters inside**,
because RLS no longer filters under `security definer` and that filter is then
the only defence left (the same warning `push_records` carries):

- `open_share(p_note_id)` / `close_share(p_note_id)` — the second deletes every
  row, member and invite of that note.
- **`delete_records(payload)`** — the missing half of the move (§2), and the only
  way a note can leave the encrypted pipe. `records` grants `select` and nothing
  else, and its rows are opaque, so the ids come from the client; the owner
  filter is explicit inside, like everywhere else here. It deletes rows of the
  caller's own account and can do nothing else — `reset_cloud()` stays the only
  way to empty an account.
- **`reset_cloud()` — existing, and it has to learn about shares.** It is the
  other door out (spec 035, "empezar de nuevo la nube"), it deletes `records`,
  `pairings` and `vaults` for the caller, and it goes through the same
  `resetCloudState` as signing out — which flow 9 makes clear the `share` marks.
  Left as it is, the result is the loudest possible breach of §2: the server
  still holds the note in `share_rows` with its members attached, the device no
  longer believes it is shared, and the note goes back up the encrypted pipe.
  One note, two pipes, permanently. So `reset_cloud()` also deletes the caller's
  `shares`, `share_rows`, `share_members` and `share_invites` — closing every
  share they own, which is what "empezar de nuevo" means. Their *memberships* in
  other people's notes are deleted too (the row in `share_members` where they are
  the member): the account is being emptied, and a membership left behind would
  re-download somebody else's note onto a device that just erased everything.
- `create_share_invite(p_note_id)` / `accept_share_invite(p_token)`.
- `remove_member(p_note_id, p_member_id)` / `leave_share(p_note_id)`.
- `push_shared_rows(p_note_id, payload)` — same `base_seq` version control as
  `push_records`, plus the role check: **a caller who is not the owner may only
  write `table_name = 'activity'`, and only as an insert** (the primary key
  already answers "does this row exist"; a member's write that would update is
  refused, not merged). It also **overwrites `actor` and stamps `author_id`** on
  every member row, per section 4.
- `pull_shared_rows(p_note_id, p_cursor)` — membership-checked read, returning
  rows plus the member display names.
- **`list_shares()`** — "what am I in?", for this account: the notes I own-share
  and the notes I am a member of, with role and title. Without it two flows in
  this spec have no way to start. **A guest's second device** has no local copy
  of the note at all — their own encrypted pipe is gated against it by section 2,
  so a shared note is not in `records`, and the backup dump skips it too (see
  "Local"); the only way it reaches their phone is by asking the server what they
  belong to. Same for the
  owner's second device, and same after restoring a backup (flow 8), where
  `notes.share` is deliberately absent because it is not `backupSafe`.

RLS keeps the shape the project already uses: `select` limited to owner or
member, every write through a function and nowhere else.

Realtime: **not in the first version.** The design is a topic per shared note
(`nota:<note_id>`) with a policy that checks membership — same discipline as the
account channel, an empty "come and look" and never content, sent only when
somebody else is connected, because it is billed per message. It is out for what
it costs to build and to run: `live.ts` holds a single module-level channel, so N
shared notes means N channel lifecycles; and the account channel's policy is a
string comparison against `cuenta:<uid>`, while a per-note one needs a subquery
against `share_members` evaluated **per message**, on a channel billed per
message. The 30-second clock already exists, already drives both pipes, and is
already what the product promises. Add the channel the day somebody says the wait
is too long; nothing else in this spec depends on it.

### Local (Dexie)

- **`notes.share`** — `null`, `'owner'` or `'member'`. Decides which pipe the
  note uses. **It must not survive a backup**: a restored file must not claim a
  note is shared, and the truth is re-read from the server on the next sync. This
  is the exact failure the agent kill switch had when it was left to a backup
  file. The mechanism is `LOCAL_ONLY_FIELDS` in `export-import/schema.ts` (today
  `changeSeq`, `cloudSeq`, `fromCloud`) — **not** `backupSafe`, which lives in
  `settings-registry.ts` and covers preference keys, not row fields. An earlier
  draft named the wrong one.

  Stripping the field is necessary and **not sufficient**: `dumpAllTables`
  (`storage/backup.ts`) dumps `BACKUP_TABLES` whole — `notes`, `blocks` and
  `activity` are all on it — so the note's rows land in the guest's backup file
  with the share mark stripped off, and a restore reads them as their own and
  uploads the owner's text into the guest's account through the guest's own
  encrypted pipe. **Decided with Hernán on 2026-08-12: the dump skips the rows of
  notes this account is only a *member* of.** They are the owner's, and the guest
  gets them back from the server (`list_shares()`) like they did the first time.
  Once the share closes the mark is null, the note is an ordinary local note of
  theirs, and it backs up like any other — which is exactly what keeps §7's
  promise that their copy stays.

  The one seam in that promise, named so nobody reports it as a bug: the guest
  may copy lines out (§Objective says so on purpose), and a line they paste into
  a snippet or another note of theirs is **their** row from that moment — it
  backs up and it uploads through their own encrypted pipe. That is copying, not
  sharing, and it is the same thing that happens when somebody pastes your text
  into any other app.
- **The shared download cursor, per note — and NOT a field of the `notes` row.**
  An earlier draft called it `notes.shareCursor` and put it on the row. `notes`
  is a synced table with a stamping hook (`storage/db.ts`): every write raises
  `changeSeq`. Saving the cursor on each pass would mark the note as changed on
  each pass — the shared uploader would send the note row up, the other device
  would download it, write its own cursor, and send it back: a ping-pong between
  the owner's two devices, one round every 30 seconds, for ever. It is the same
  trap §5 caught for the derived `checked` and missed for its own bookkeeping.
  The cursor goes where the account-wide one already lives: a `settings` key per
  note (`settings` is not a synced table, spec 002), which also takes it off
  `LOCAL_ONLY_FIELDS` — a value that is not a row field cannot leak out as one.
  The news counter's "highest activity seq shown" is the same shape and goes the
  same way.
- **Those per-note keys need a declared PREFIX, not just a name.** `setSetting`
  takes any string, so `share:cursor:<noteId>` works the minute it is written —
  and that is the trap, because three other places read the registry rather than
  the table. `settings-registry.ts` is the declared list of every key and its
  backup policy; `isBackupSafe` answers `false` for a key it does not know, which
  is the right answer here reached by accident. `export-import/backup.ts` filters
  the dump by it. `replaceAllTables` keeps what is *not* backup-safe across a
  restore, which is also what these want. And `resetCloudState` (flow 9) clears
  keys one at a time from a fixed list — a per-note key can never be on a fixed
  list, so sign-out would leave every cursor behind. So: one declared prefix
  covering all three per-note values (the download cursor, the news counter's
  high-water mark, and the share's opening mark from §3), deny-by-default in the
  backup *because* it is prefixed rather than because nobody declared it, and one
  `forgetSharePrefixes()` that sign-out calls. Worth knowing before it surprises
  somebody: `setSetting` writes the localStorage journal synchronously on every
  call, so a cursor saved each pass is one small synchronous write per shared note
  per pass.
- **`activity.serverSeq`** — the order the server received the entry. Re-attached
  on the way in exactly as `changeSeq` is (a column of `share_rows`, never part of
  the payload), and the only thing §5's derivation sorts by. It joins
  `LOCAL_ONLY_FIELDS`: it is a claim about a server, and a claim like that is
  false the moment the row is restored anywhere else — the same reason `cloudSeq`
  is on that list. An entry not uploaded yet simply has none, and that absence is
  meaningful rather than missing data: §5 sorts it last.
- **`activity.actor`** — gains the `'member:<uuid>'` form.
- **A non-synced table for member display names**, filled by the read call.
- **A non-synced per-note "highest activity seq shown"** for the news counter.
- **All of that is a Dexie version, and the spec had not named one.** Two row
  fields (`notes.share`, `activity.serverSeq`) need no schema line — Dexie's
  `stores()` strings declare indexes, not columns — but the display-name table
  does: `db.version(11).stores({ ... })`, with its comment, like every version
  before it (`storage/db.ts`), and `db.migrations.test.ts` is the guard that
  notices when a version arrives without one. Three lists must then NOT be
  touched, and the reason is different in each: `SYNCED_TABLES` (it would upload
  a cache of other people's names), `BACKUP_TABLES` (it would put them in a
  plaintext file, and `replaceAllTables` clears exactly that list — staying off
  it is also what makes the cache survive a restore, which is what we want), and
  the server's own `check (table_name in (...))` on `records`, which is tied to
  `SYNCED_TABLES` by a comment and would start refusing writes if the two drift.

## User flows

1. **Share.** Note menu → "Compartir". A screen states plainly that the note
   leaves the vault and that the server can read it while shared; confirming
   opens the share, moves the note to the shared pipe and produces the invite
   link. The note shows a mark in the sidebar from then on.
2. **Accept.** The guest opens the link. Signed out → sign in or sign up, then
   land back on the invite. Signed in → "Fulano te compartió «Título»" and an
   accept button. Accepting downloads the note into their own app, read-only.
3. **Work the ticket.** The guest reads and copies lines freely, ticks tasks and
   leaves comments. Everything they do is signed with their name in the bitácora.
4. **"Listo".** One button, one bitácora line.
5. **See the news.** The owner sees a count on the note in the sidebar; opening
   it clears the count for that device.
6. **Stop sharing.** The owner removes a member or closes the share. The note
   moves back to the encrypted pipe. The confirmation says, before it happens,
   that the copy already on the other device stays there.
7. **The guest leaves.** Same from the other side; their local copy stays and
   stops receiving changes.
8. **Restore a backup.** After a restore, what is shared is re-read from the
   server, because a merge may have given the note a new id.
9. **Sign out.** `sync/leave.ts` must also drop membership state, the per-note
   cursors and the `share` marks, exactly as it already drops the key, the
   consent and both cursors — or the next account inherits them. **Clearing the
   marks is what makes step 4 of §2 mandatory**: from that moment the device no
   longer knows the note is shared, so `list_shares()` has to run before the next
   upload or the note goes up the encrypted pipe on its own.
10. **Empezar de nuevo la nube.** `resetCloud()` runs the same local cleanup
    through a different door, and its server half is `reset_cloud()`, which must
    close the caller's shares and drop their memberships (see the server
    functions). Sign-out leaves the server untouched; this one empties it, and
    the two must not be treated as the same flow because the local half is
    identical.

## Privacy

The product promise changes shape and must be restated everywhere it appears:

> Your notes are encrypted and the server cannot read them. **A note you share
> is not**, for as long as it is shared.

- The warning lives **on the sharing screen at the moment of sharing**, not in
  Configuración.
- `docs/guia/` gets it in the same commit as the implementation, per the user
  guide rule.
- The existing ban on the words "conocimiento cero" until the phase 4 audit is
  unchanged and now has a second reason.
- A shared note in the clear on our server also means a moderation duty appears:
  there must be a way to remove one that is reported. A query, not a screen.

## Acceptance criteria

1. A note can be shared with another account, and that account sees its text,
   its tasks and its bitácora — and nothing else of the owner's data.
2. The guest cannot change one character of the note's text: not in the UI, and
   not by calling the server directly with a handcrafted request.
3. The guest ticks a task; the owner sees it, attributed by name, without any
   conflict being raised on either side.
4. The guest comments; same.
5. Owner and guest tick and comment **at the same time, both offline**, then both
   reconnect: everything lands, nothing is lost, no conflict is parked. If the
   two touched the *same* task in opposite directions, the entry the server
   received last is what both then show (criterion 19) — a checkbox settles
   itself, and neither person is asked anything.
6. The owner's folder, sidebar position, tags and agent visibility for that note
   are unchanged on their device and absent from the guest's.
7. Sharing a note removes it from `records` on the server; unsharing removes it
   from the shared tables and puts it back. **On the device doing the move it is
   never in both**, and a crash mid-move leaves it in exactly one. On the owner's
   *other* device the window closes at the next `list_shares()`, whose
   reconciliation deletes the stray rows — a tested path, not an assumption.
8. `pnpm rls:check` passes, including the new cases: a member writing a block, a
   member writing another note's rows, a non-member reading anything, **and a
   member signing a row as somebody else** (`actor: 'user'` in the payload comes
   back stored as `member:<their own uuid>`).
9. A guest signing in on a **second device** — one that has never held this note —
   receives it, because `list_shares()` told the app it exists. Same for the
   owner, and same after restoring a backup.
10. The owner's undo history survives a guest tick, and Ctrl+Z never un-ticks it.
11. Removing a member stops their sync and the UI said beforehand that their copy
    remains.
12. Signing out and into a different account leaves no membership, no cursor and
    no `share` mark behind.
13. A shared note arriving on the owner's **second** device leaves that device's
    `folderId`, `sortOrder`, `agentVisible`, `blocks.note` and — above all —
    `notes.share` exactly as they were, so the note does not fall back into the
    encrypted pipe. Resolving a conflict with "take the remote one" does the
    same.
14. A backup taken on the **guest's** device does not contain the shared note
    while the share is open, and does contain it once the share has closed.
15. The owner deletes a shared note: it disappears from the guest's list (there
    is no papelera to land in — §7). The owner removes the guest's access
    instead: the guest's copy stays.
16. **Manual gate, two real accounts on two machines** — the same discipline as
    the two-device gate: a note shared, ticked, commented, "Listo", news counter
    seen, access removed. Automated tests do not close this one. **And it is run
    from the guest's side as well as the owner's**, because until the domain
    lands (Rollout) the only guest is Hernán's second account and nobody else
    will ever report what breaks there: on the guest's machine, file the shared
    note into a folder of theirs, drag it in their sidebar, switch their agent's
    visibility on, then confirm that a tick made afterwards still reaches the
    owner and that "sin subir" returns to zero. That sequence is §3c, and it is
    invisible from the owner's screen.
17. A backup taken after a "Listo" **validates and restores**, the note-level
    entry included — not rejected as a whole file, and not silently dropped.
18. The guest's copy carries no bitácora entry from before the share opened, and
    a task the owner had already ticked still arrives ticked.
19. Owner and guest toggle the same task; the entry the **server received last**
    is the state both devices show, whatever the two clocks say. An entry not
    uploaded yet counts as the newest on the device that wrote it.
20. A guest with no upload consent and no vault sees an honest count of what is
    still unsent — never "Todo subido" over a queue.
21. The guest files the shared note in a folder, moves it in their sidebar and
    switches their agent's visibility on. Each one shows on their screen, none
    of them travels, **and the unsent count returns to zero** — the note's row
    never becomes a permanently pending upload, and the shared pipe keeps
    handing up their ticks afterwards (§3c).
22. A block arriving through the shared pipe with markup outside the inline
    allow-list, an unknown `type` and an impossible `dueDate` lands cleaned:
    the text survives, the markup does not reach the DOM, the type falls back and
    the date is dropped (§3b).
23. `reset_cloud()` closes the caller's shares and drops their memberships, and
    the note is afterwards in the encrypted pipe **and nowhere else** — not still
    published in `share_rows` while the device syncs it as a private note.
24. A device whose `share` marks are absent — freshly restored from a backup, or
    just re-consented after a sign-out — does not upload the shared note to
    `records` on its first pass. `list_shares()` runs before the upload, not
    after it (§2).
25. A note arriving through the shared pipe for the first time gets a sidebar
    position, no folder, its agent visibility off and a local `createdAt` — it
    does not sit at the bottom of the list for ever (§3).
26. A member's comment reaches the owner's **agent** attributed to that member by
    name — through `get_task_history` and through `export.json`, not only on
    screen (§6).

## Minimum tests

Vitest:

- The field allow-list: a row with `folderId`, `agentVisible`, a tag assignment
  and a sidebar position produces a shared payload with none of them. Written as
  deny-by-default: an unknown field added to the row must not appear.
- One note, one pipe: `pending.ts` returns nothing for a shared note's rows, and
  the shared uploader returns nothing for an ordinary note's rows.
- The move: after sharing, the note's rows carry a reset `cloudSeq`; after
  unsharing, `listPendingUploads` **actually returns them** — written against a
  device whose `syncUploadedThrough` mark is already above the note's original
  `changeSeq`, which is the case that fails if only `cloudSeq` is reset.
- The derived tick does not queue an upload: applying a bitácora entry to
  `block.checked` leaves `changeSeq` untouched, so `countPendingUploads` is
  unchanged by it.
- A **member's** tick through `lib/tasks`'s own door does not queue the block
  either — `countPendingUploads` is unchanged, and the shared uploader offers
  only the `activity` row for that note. This is the jam in §5 and it deserves
  two tests, one per guard.
- A cascading tick by a member (a parent with two todo children) writes one
  bitácora entry per affected block, and the other device derives the same three
  `checked` values from them.
- A download batch carrying the owner's block row and the guest's bitácora entry
  **in either order** ends with the same derived `checked`.
- The shared pipe runs with no vault key and no upload consent; the encrypted
  pipe still hands out nothing without both.
- Tick derived from the bitácora, including two entries from two accounts that
  minted the **same `seq`** (deterministic by `id`, and the same order on both
  devices).
- Undo preserves the live `checked` and does not mark the history stale for a
  tick-only change.
- `actor: 'member:<uuid>'` renders through the agent-style label map with the
  name substituted.
- `isRedoRequested` still finds the owner's redo request when a member's comment
  landed after it.
- **The merge (§3b)**: a local row carrying `folderId`, `agentVisible` and
  `share: 'owner'` still carries all three after a shared payload lands on it,
  and the payload's own fields won. The same assertion through `takeRemote`.
- **The scoped comparison**: a local `folderId` against an absent remote one is
  "the same to the user" for the shared pipe and parks no conflict — while the
  encrypted pipe's comparison is unchanged by it.
- **The gate covers three tables and not four**: `listPendingUploads` returns the
  `tagAssignments` of a shared note and none of its `notes` / `blocks` /
  `activity` rows.
- **The cursor is not a row**: a shared download pass that only advanced the
  cursor leaves the note's `changeSeq` untouched, so it queues no upload in
  either pipe.
- `dumpAllTables` on a member's device omits the shared note's rows, and includes
  them once `share` is null.
- **A backup carrying a note-level entry** (`blockId: null`) validates, keeps that
  entry, and restores it — one test through `validateBackup` and one through the
  restore, because the two failures are different (a rejected file and a dropped
  row) and only the first one is loud.
- **The bitácora starts blank**: sharing a note with three older entries hands the
  guest none of them, and a task the owner had ticked before sharing arrives
  ticked anyway (the cache travels; the derivation has nothing to override it
  with).
- **The tick follows the server, not the clock**: two entries whose `seq` order is
  the reverse of their `server_seq` order derive the state of the later
  `server_seq`. And an entry with no `server_seq` yet sorts after every entry that
  has one.
- The unsent count covers both pipes: a member with no consent and no vault and
  three unsent `activity` rows reports three, not zero.
- **The member's organisation writes do not queue (§3c)**: on a note this account
  is a member of, a folder change, a sidebar move and an agent-visibility switch
  each land on the row and leave `changeSeq` untouched, so `countPendingUploads`
  is unchanged by all three — and a tick made afterwards is still offered by the
  shared uploader. Two tests, one per write seam (`updateNote` and
  `applySidebarUpdates`), because they are two different call shapes and only one
  of them knows which note it is writing.
- **An arriving shared row is cleaned (§3b)**: a payload whose `html` carries a
  tag outside the inline allow-list, whose `type` is unknown and whose `dueDate`
  is impossible lands with the text intact, the markup unwrapped, the type fallen
  back and the date null. Written as deny-by-default, like the allow-list test.
- **The arrival defaults (§3)**: a note arriving with no local row gets a
  `sortOrder`, `folderId: null`, `agentVisible: false` and a `createdAt`; the
  same payload arriving onto an existing row changes none of the four.
- **`list_shares()` before the upload (§2)**: a device holding the note's rows
  with no `share` mark and a cleared `cloudSeq` — the shape `resetCloudState`
  and a backup restore both leave behind — hands `records` nothing on its first
  pass.

In the `mcp/` workspace (its own vitest project): `get_task_history` renders a
member's entry with that member's name, not "agente".

`scripts/rls-check.mjs`: the three new attacks in criterion 8, plus a fourth —
`delete_records` handed another account's ids deletes nothing — and a fifth:
`reset_cloud()` closes the caller's own shares and leaves another account's
`shares`, `share_rows` and `share_members` standing. Run against the real
Supabase project — a local Postgres has already passed while the real one refused
(spec 030).

Playwright: two browser contexts, two accounts. Share, accept, tick, comment,
see it on the other side, remove access. Wait for a post-boot signal before
touching anything — the app is prerendered and a click before hydration is
silently dropped.

## Agent notes

- **The rule to protect above all others**: a shared note travels by one pipe.
  Any future feature that writes a shared row must ask which pipe it is on. The
  cheapest guard is that both uploaders read the same `notes.share` field, so a
  new caller cannot forget it by omission.
- **The guest only ever appends.** If a future change makes the guest modify any
  existing row, this spec's central property is gone and the lock machinery from
  "Why not multiplayer" becomes necessary. That is a product decision, not a
  refactor.
- **The guest's role check lives in SQL.** `security definer` means RLS no longer
  filters; the explicit owner/member filter inside each function is the only
  defence. This is written three times in `schema.sql` already for the same
  reason.
- **`isRedoRequested` only looks at the LAST bitácora entry.** A member comment
  landing right after the owner asked for a redo hides that request. One line to
  fix, easy to miss, already documented in `AGENT.md` as a standing trap.
- **`lib/tasks` stays the single door** for `created` / `done` / `reopened` /
  `note`. A member's tick and comment go through it with a different `actor`, not
  through a parallel path.
- **That door writes the BLOCK, not only the bitácora**, and every reading of §5
  depends on remembering it. A change that sends a member through it without the
  member branch re-creates the jam, and the symptom is not a tick that fails — it
  is a sync cursor that quietly stops advancing for everything else.
- **`records` cannot be deleted from, on purpose.** `delete_records` is the one
  exception and it has exactly one caller. Do not widen it, and do not add a
  delete policy to `records` to make some other job easier: the reason there is
  none is that a deletion travels as a tombstone, never as a missing row.
- **The member is shaped like the agent.** The MCP agent already reads only what
  the user made visible, completes tasks, leaves notes and cannot rewrite text —
  and it already has a kill switch and a per-note visibility flag. When a
  question about a member's permission has no answer here, the answer is
  probably whatever the agent does.
- **Do not exclude `order` from `row-compare.ts`** to make sharing quieter. It is
  excluded from nothing on purpose: two rows in different places are not the same
  thing to the person looking. The right fix is that organisation fields never
  travel, which is section 3.
- **The download cursor may not move strictly forward.** Copy the overlap window
  from `sync/download.ts`; do not reinvent the reasoning.
- **A shared payload is a projection; every writer of an arriving row assumes a
  whole row.** Before reusing anything from `sync/` on the shared pipe, ask what
  it does with a field that is simply *absent*: `putFromCloud` replaces it away,
  `sameToTheUser` calls it a disagreement, `takeRemote` does both. §3b.
- **No bookkeeping about a shared note goes on a synced row.** A stamped row that
  is written on a timer uploads on a timer, and two devices doing it push the
  same row at each other for ever. Cursors and counters go in `settings`.
- **What decides a tick is the order the SERVER received the entries**, never
  `seq` and never a timestamp. Both of those come from a clock, and there are two
  clocks now. The displayed list is the opposite case and stays on `seq`. Two
  comparators, one sentence each, and mixing them up is silent.
- **A row is not the only thing that can be private.** The field allow-list is
  §3's answer to "what of this row travels"; "which rows travel at all" is a
  separate question and the bitácora is where it bit. A future table hanging off
  a shared note has to answer both.
- **Any screen that says "todo subido" has to know about both pipes.** A count
  that reads one queue is a lie on the device that is using the other one, and
  the lie is invisible precisely on the guest's machine, where nobody is looking.
- **`changeSeq` comes from the clock**, so two accounts can mint the same number
  for the same row. The shared pipe reuses `decide()`'s contract — a matching
  number is not proof of an echo, the content decides — rather than writing a
  second version of it.
- **A row a member writes and no pipe accepts is a stalled cursor, not a stalled
  row.** §5 caught it for `blocks`, §3c for `notes`. The general rule: before
  giving the guest any new local write, ask which pipe carries that row — and if
  the answer is neither, it goes in with `fromCloud`. This is the guest-side
  version of "no bookkeeping on a synced row" and it has bitten twice.
- **The shared pipe is untrusted input.** Everything arriving through it was
  produced by another account's client. `format/sanitize.ts` carries the list of
  write boundaries that must pass its gate, and this is a new one — add it to
  that comment, do not leave the knowledge here. The encrypted pipe is not a
  precedent: its payloads were written by your own devices.
- **The guest's device has no witness.** The owner watches their own note; the
  guest is somebody who will stop answering rather than report a bug. Anything
  that fails only on their machine fails silently by construction, which is why
  criterion 16 is run from both sides and why §3c, §3b and §3's arrival defaults
  each got their own test rather than riding on the two-account e2e.
- **`reset_cloud()` and signing out share their local half and not their remote
  one.** The local cleanup is the same function; only one of the two also empties
  the server. A share closed on the device and left open upstairs is the worst
  version of "one note, two pipes", because nothing on either screen shows it.

## Rollout: build now, invite outsiders later

Decided with Hernán on 2026-08-12, and it is an ordering constraint rather than a
design one.

The guest needs an account, so this feature is the first one that hands a link to
somebody who is not Hernán. But the vault key lives in IndexedDB, which is scoped
**per origin**: if the app later moves to its final domain, every key stays
behind on the old one. That is the same reason the public sign-up work (specs
`036`/`037`) is parked waiting for him, and it applies here with a sharper edge —
a stranded guest cannot ask their other device for the key, because they only
ever had one.

So: build and test the whole thing, including the manual two-machine gate, using
**two accounts Hernán controls**. Handing an invite link to a real third person
waits for the domain, alongside `036`/`037`. Nothing in the implementation
changes; only when the first outside link is sent.

## Product direction — decided

**Approved and applied on 2026-08-12** (`AGENT.md`, "Product Principles"). Kept
here as the record of what changed and why.

`AGENT.md` used to state, in "Product Principles":

> **Narrow scope.** Write, organize, copy, reuse, backup. NOT a Notion
> competitor: no workspace databases, complex tables, heavy dashboards, or
> enterprise collaboration.

This spec does not contradict "no enterprise collaboration" — there are no
workspaces, no team accounts, no permission matrix, and only one person can ever
write the text. But it does add a second person to a product that had one, and
that sentence is the first thing an agent reads.

It now reads:

> **Narrow scope.** Write, organize, copy, reuse, backup — and hand one note to
> one other person so they can respond to it (spec `038`). NOT a Notion
> competitor: no workspace databases, complex tables, heavy dashboards, or
> enterprise collaboration. A shared note has exactly one author; a guest may
> tick and comment, never rewrite.

The `docs/guia/` topic file and the "Where Detail Lives" table in `AGENT.md` are
part of the implementation commit, not of this spec.

## Part B2 — design decisions, 2026-08-17

B1 shipped (`e75b5b7`): the second person enters, reads and copies. B2 is the
half where they answer. These are the calls taken with Hernán before writing the
plan; they amend the sections named, they do not replace them.

**Nothing here needs new SQL.** B1 already built every server-side piece B2
relies on: `push_shared_rows` overwrites `actor` with `'member:' || auth.uid()`
and stamps `author_id`, `pull_shared_rows` returns `server_seq` and `author_id`,
and `read_share_members` lets any participant read the note's names. B2 is a
client-only change, so it has no gate step that waits on a human pasting SQL.

**1. Scope: tick, per-task comment, and "Listo" — the last one moved forward.**
"Listo" is written in §8 as part of B3. It ships in B2 instead, because a guest
who can tick and comment but cannot say "I finished" has to invent a fake task to
say it. It gains **an optional text line** beside the button: `appendActivity`
already carries `text`, so the row costs nothing and "Listo — falta la factura de
marzo" is the answer people actually give. The news counter, the other half of
§8, stays in B3.

**2. The comment door is one item of the `⋯` menu**, not a new control. B1 closed
that menu whole because every item of it writes; B2 reopens exactly one, "Dejar
una nota". The gesture and the result already exist — an italic line under the
task — so the guest's comment looks like the owner's even though one is a block
field and the other a bitácora row. That difference is invisible and must stay
invisible, with one exception the UI has to be honest about: **the guest's
comment can never be edited or deleted**, by either side, because §4 forbids a
member touching a row that already exists.

**3. The two anti-jam guards of §5 and §3c are dropped — measured, not assumed.**
The jam those paragraphs describe does not exist in the code that was actually
built. `sync/pending.ts`'s `skipsSharedRows` removes every row of a shared note
from the encrypted pipe; `listSharedPending` offers a member `activity` and
nothing else; and `pushSharedNote` marks row by row with `markSentToCloud`,
carrying no cursor of the shape `uploadedThrough` has. An unsendable row of the
guest's is therefore pending for ever *and invisible to both counters and both
pipes*: it drags nothing. What survives of those two paragraphs is one flag, not
a task — see decision 6.

**4. `checked` comes off `sameInAllowList`.** With the tick derived, the owner's
block row keeps arriving with their older `checked` on every pass it is still
inside `pullSharedNote`'s re-read window, so a comparison that includes `checked`
reports a change every time: `applied` rises, `appliedVersion` rises, and the
open note refreshes itself every 30 seconds for nothing — the exact waste the
comment above `pullSharedNote` exists to prevent. Once the bitácora is the source
of truth, `checked` is a cache and comparing it is comparing the wrong thing. It
still travels on the row (a block arriving on a device that has never seen it
carries its value, because `sameInAllowList` returns false on a missing local
row); it just stops deciding whether anything changed.

**5. The derivation only acts on a block that has at least one `done`/`reopened`
entry.** Otherwise it would untick every task whose `checked` was set by a path
that leaves no line — a restored backup, a pasted `[x]`, a task from before the
bitácora existed. No entries means no opinion, and `block.checked` stands.

**6. The guest's tick writes its block with the `fromCloud` flag.** This is the
one line left of decision 3. It is not needed to prevent a jam; it is needed
because that write is not a local change, and without it the row sits
`changedSinceCloud` for ever and becomes uploadable to the guest's own vault the
day they leave the share. As §5 requires, "is this account a member" is resolved
by the caller before the transaction opens, never read inside it.

**7. The agent sees the guest, named and labelled.** `mcp/lib/tools.js` renders
"Juan (invitado) dejó una nota: …". Hiding those entries would leave the agent
looking at a ticked task with no reason for it, which is precisely the "what
happened" it is useful for. Two things already checked: `isRedoRequested`
(`src/lib/tasks/redo.ts`) requires `actor === 'user'`, so a guest's comment
cannot order the owner's agent to redo anything; and the name has to be resolved
**into** `export.json`, because the display-name cache is a Dexie table the MCP
server cannot read.

The "Listo" reaches the agent too, decided 2026-08-17 when Hernán asked why it
would not. It costs no new tool: `mcp/lib/resources.js` is the projection the
agent reads unprompted, so the latest "Listo" is one line under the note's
title. A first pass had it excluded on the grounds that it needed a tool — that
was wrong, and wrong in a way worth recording: it looked only at `tools.js`,
where every question needs its own tool, and never at the always-on projection
beside it. "Listo" is a state, not a history, so the projection is where it
belongs anyway.

**8. The name cache is filled on every sync pass, not only when the share dialog
opens.** Today `listMembers` runs from `ShareDialog` alone, so an owner who
reads the bitácora without opening that panel — or a guest naming a second guest
— has no name to show. `reconcileShares` already makes the call that knows which
notes are shared; the member names ride along with it.

**9. `server_seq` has to be stored on the local `activity` row.** §5 decides the
tick by server order, and a device that already holds a row will not re-fetch it,
so the number cannot stay in the response. It is bookkeeping: it must be excluded
from `SHARED_FIELDS` and from the backup, and included in whatever list keeps a
bookkeeping difference from being read as a disagreement. The implementation plan
owns enumerating those lists — a new field on a synced row is the same trap spec
`040` recorded, where a new pipe touched three of the five lists it needed.

## Estimated cost

~15 days of work, tests and gates included, after deferring section 10. The
second review moved money in both directions and it roughly cancels: the per-note
realtime channel came out (−1 to −2 days, and a running cost that would have been
billed per message), `delete_records` and the two anti-jam guards went in (+1).
The third added ~1: the merge write, the scoped comparison and the backup filter
are each small, but each needs its own test, and two of them are the difference
between a working feature and silent data loss on a device nobody is watching.
The fourth added ~1 more, and none of it is new function: the backup fix, the
two-queue count, the server-ordered derivation, the bitácora filter and the
prefixed settings keys are all small, but every one of them is a place where a
decision already made had no way to be expressed in the code as it stands.
The fifth added ~1 and is also all existing function, but it moved *where* the
work is: five of its eight items are on the guest's device, which had been
costed as "the same app, downloading instead of uploading" and is not. The two
write seams of §3c, the cleaning pass of §3b, the arrival defaults, the ordering
constraint on `syncNow` and `reset_cloud()` are each an hour or two of code and
a test — the day goes to the fact that none of them can be seen from the owner's
screen, so each one needs its own check rather than riding on the two-account
end-to-end test.
The bulk
is not "letting a guest respond" (≈3 days); it is "letting another account see
your note at all" — the membership, the second pipe, the invitation and the move
between pipes. That part would be paid by any sharing design, including the ones
dropped above.

It is the largest single item this project has taken on, so the implementation
plan splits it where it can actually be verified: the pipe and the move (the part
that can silently break existing sync) ships and is proven before anything about
a second person is built, and the two dangerous rules — one note one pipe, and
the guest only appends — each get their own test before the UI that relies on
them exists.
