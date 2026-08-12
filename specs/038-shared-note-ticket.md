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

- `sync/pending.ts` — the single door records leave through — skips every row
  belonging to a shared note. Shared rows leave through the shared uploader and
  nowhere else. This gate is the mirror of the consent gate already living
  there, and it belongs in the same place for the same reason.
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

This rule applies on the guest's device too, mirrored: a shared note on the
guest's machine is an ordinary local row that their own vault would happily
upload. It must not. Same gate, same reason.

### 3. Shared content, private organisation

A shared note is **not "the same row in two accounts"**. It is shared content
plus each side's own private organisation.

Only an explicit allow-list of fields travels through the shared pipe:

| Table | Fields that travel |
|---|---|
| `notes` | `id`, `title`, `updatedAt`, `changeSeq`, `deletedAt` |
| `blocks` | `id`, `noteId`, `parentBlockId`, `order`, `type`, `content`, `html`, `checked`, `dueDate`, `deletedAt`, `changeSeq` |
| `activity` | `id`, `blockId`, `noteId`, `actor`, `action`, `text`, `seq`, `at`, `deletedAt` |

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
- **Snippets, folders, settings** — not part of a note.

- **`createdAt`** — not on either allow-list, so the guest's copy has none. The
  guest's side fills it in locally when the note lands, the same way any locally
  created row gets one. "When did this note come into existence" is not a fact
  about the note, it is a fact about a device's copy of it.

Note the distinction that matters and is easy to get backwards: **`blocks.order`
travels** (it is the note's internal structure = content); **the note's order in
the sidebar (`notes.sortOrder`) does not** (that is organisation).

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

The bitácora is ordered by `seq`, and **the `id` tie-break has to be added** —
`listActivityByBlock`'s `bySeqAsc` (`storage/activity.ts`) has none today, on
purpose: `seq` came from one device's monotonic counter, so it could not tie.
Two accounts are two counters, and `nextChangeSeq` reads the clock, so from now
on it can. Add the tie-break to the shared comparator, do not remove the comment
explaining why the old random tie-break was taken out.

Clock skew between two accounts is accepted, not fixed: a guest whose clock runs
behind lands their comment slightly earlier in the list than it happened. It is a
display order, not a correctness property, and `server_seq` is not a substitute
because rows written offline do not have one yet.

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

`SettingsDialog.svelte` holds two `ACTION_LABEL` maps because the user and the
agent conjugate differently in Spanish. A member conjugates like the agent
(third person), so the existing agent map covers it with the name substituted.

### 7. Invitation by link, access by account

- The owner generates an invite link with a random token and an expiry.
- **The link grants nothing.** Opening it while signed out leads to sign-in or
  sign-up; accepting it while signed in creates the membership row and records
  who accepted. This is what makes "who ticked this" answerable at all.
- One membership per note per account. Re-accepting is a no-op.
- The owner sees the list of members and can remove any of them.
- Removing access stops the sync. **It cannot remove the copy already on the
  other person's device**, and the UI says so in those words before confirming.

### 8. "Listo" and the news counter

The two halves of "how does the ticket come back", which is otherwise a question
with no answer because nothing has to physically return:

- **"Listo"** — a button for the member that appends one `activity` entry to the
  note. It is a statement, not a state machine: no workflow, no approval, no
  reopening ceremony. The owner reads it in the bitácora like any other line.
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
  order. Re-read a window, do not trust a strictly forward cursor.
- **`profiles (id uuid primary key, plan text)`** — deferred with section 10, not
  created in the first version.

Functions, all `security definer` with **explicit owner/member filters inside**,
because RLS no longer filters under `security definer` and that filter is then
the only defence left (the same warning `push_records` carries):

- `open_share(p_note_id)` / `close_share(p_note_id)` — the second deletes every
  row, member and invite of that note.
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
  so a shared note is not in their backup and not in `records`; the only way it
  reaches their phone is by asking the server what they belong to. Same for the
  owner's second device, and same after restoring a backup (flow 8), where
  `notes.share` is deliberately absent because it is not `backupSafe`.

RLS keeps the shape the project already uses: `select` limited to owner or
member, every write through a function and nowhere else.

Realtime: a topic per shared note (`nota:<note_id>`) with a policy that checks
membership. Same discipline as the account channel — the message is an empty
"come and look", never content, and it is only sent when somebody else is
actually connected, because it is billed per message.

### Local (Dexie)

- **`notes.share`** — `null`, `'owner'` or `'member'`. Decides which pipe the
  note uses. **Not `backupSafe`**: a restored backup must not claim a note is
  shared, and the truth is re-read from the server on the next sync. This is the
  exact failure the agent kill switch had when it was left to a backup file.
- **`notes.shareCursor`** — this note's download cursor for the shared pipe.
- **`activity.actor`** — gains the `'member:<uuid>'` form.
- **A non-synced table for member display names**, filled by the read call.
- **A non-synced per-note "highest activity seq shown"** for the news counter.

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
   consent and both cursors — or the next account inherits them.

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
   reconnect: everything lands, nothing is lost, no conflict is parked.
6. The owner's folder, sidebar position, tags and agent visibility for that note
   are unchanged on their device and absent from the guest's.
7. Sharing a note removes it from `records` on the server; unsharing removes it
   from the shared tables and puts it back. At no point does it exist in both.
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
13. **Manual gate, two real accounts on two machines** — the same discipline as
    the two-device gate: a note shared, ticked, commented, "Listo", news counter
    seen, access removed. Automated tests do not close this one.

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
- Tick derived from the bitácora, including two entries from two accounts that
  minted the **same `seq`** (deterministic by `id`, and the same order on both
  devices).
- Undo preserves the live `checked` and does not mark the history stale for a
  tick-only change.
- `actor: 'member:<uuid>'` renders through the agent-style label map with the
  name substituted.
- `isRedoRequested` still finds the owner's redo request when a member's comment
  landed after it.

`scripts/rls-check.mjs`: the three new attacks in criterion 8. Run against the
real Supabase project — a local Postgres has already passed while the real one
refused (spec 030).

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
- **`changeSeq` comes from the clock**, so two accounts can mint the same number
  for the same row. The shared pipe reuses `decide()`'s contract — a matching
  number is not proof of an echo, the content decides — rather than writing a
  second version of it.

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

## Estimated cost

~12 days of work, tests and gates included, after deferring section 10. The bulk
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
