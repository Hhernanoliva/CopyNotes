# 030 - Zero-Knowledge Cloud Sync: Encryption At The Upload Edge

Written 2026-07-27 after reviewing `docs/zero-knowledge-sync.md` against the
actual codebase. Two decisions were approved by Hernan on 2026-07-27 and are
locked below: **(1) encryption happens only at the upload edge — no local
encrypted vault; (2) the MCP bridge is hardened, not removed.**

This spec supersedes the encryption language in `029` (which said "Supabase
provides encryption") and corrects one of its acceptance criteria. `029` stays
the source of truth for the account/sync road; `030` is what makes that road
zero-knowledge.

## Objective

Make Supabase — and CopyNotes as a company — structurally unable to read a
user's notes, without changing how the app stores or reads data on the device.

The device keeps working exactly as it does today: same IndexedDB, same
plaintext local rows, same unload journal, same indexes, same speed. Encryption
is a boundary the data crosses on its way *out*, not a property of local
storage.

## Decisions Locked

### D1 — Local encrypted vault: dropped, not deferred

The reviewed draft proposed encrypting IndexedDB, the recovery journal, and
local backups before building accounts. That is explicitly **out of scope**, for
three reasons found in the code:

1. **It would lose text on every close.** `storage/journal.ts` exists because
   IndexedDB writes started during page unload are silently discarded. Its
   rescue path is a *synchronous* `localStorage.setItem` inside a `pagehide`
   handler (`editor/Editor.svelte:344-358`). WebCrypto is Promise-based and the
   browser does not wait for promises during unload, so encrypting there would
   discard the last debounce window (~500 ms) of typing on every close — the
   exact failure the journal was built to prevent.
2. **It would destroy the indexes the app runs on.** `db.ts` indexes
   `blocks.noteId`, `blocks.parentBlockId`, `blocks.dueDate`,
   `notes.updatedAt`, `tagAssignments.[targetType+targetId]`, `activity.blockId`.
   Opening a note is an index lookup (`storage/blocks.ts:77`) and the Agenda
   walks the `dueDate` index (`storage/blocks.ts:169`). Ciphertext in those
   columns turns both into a full-table scan plus a decrypt of every row.
3. **It buys little against the real threat.** The draft's own "remember this
   device" behaviour lets anyone with an unlocked macOS session open the app.
   The remaining case — a stolen powered-off disk — is already covered by
   FileVault on macOS and BitLocker on Windows, at no cost and no risk to us.

Anything that changes those three facts (for example, a "Lock CopyNotes"
feature that people actually ask for) reopens this decision. Until then, local
rows stay plaintext.

### D2 — MCP bridge: hardened, not replaced

The draft proposed deleting the persistent `export.json` mirror and requiring
CopyNotes to be open and unlocked for MCP to work. That is a product
regression: `mcp/lib/mailbox.js` reads that file from disk today and agents work
with the app closed — the behaviour shipped and verified in `028`.

`export.json` stays. It gets strict file permissions, a freshness/expiry rule,
and cleanup of `inbox/processed/`. Revisit only if telemetry or Hernan's own
usage shows the app-closed mode is unused.

## What Enters

Four phases, in order. Each is independently shippable and none blocks the
agent channel (`028`).

### Phase 0 — Close the verified gaps (no crypto involved)

Small, cheap, worth doing regardless of whether cloud sync ever ships:

- **Enable a strict CSP.** `src-tauri/tauri.conf.json` has `"csp": null`.

  **Where it landed (2026-07-29):** in SvelteKit's `csp` config
  (`vite.config.ts`), not in `tauri.conf.json`. SvelteKit ships the policy as a
  `<meta>` tag in the prerendered HTML and as a response header in dev, so one
  policy covers the web build, `pnpm dev` and the Tauri window — which loads
  that same HTML. A second policy in `tauri.conf.json` would not add cover: the
  browser enforces every policy it is given, so the two would intersect and
  silently block anything they disagreed on. `csp: null` stays on purpose.

  The policy is `default-src 'self'` with no `connect-src` beyond `'self'` and
  the desktop IPC origins, so a compromised dependency has nowhere to send a
  note. `script-src` carries two hashes for mode-watcher's anti-flash snippet
  (minified and unminified); `e2e/security-csp.spec.ts` fails if any script,
  font or image is ever blocked, because the failure mode of a CSP is silence.
- **Honest agent-consent copy.** `editor/Editor.svelte:1680` promises agents see
  "las tareas de esta nota", but the v2 export also sends prose — text, bullets,
  headings and code blocks (`bridge/export.ts:23`). Fix the wording to match
  what actually leaves.
- **Include `activity` in the backup.** `storage/backup.ts:10` omits it and
  `replaceAllTables` clears it on restore, so the bitácora is lost on every
  backup round-trip. It is user-visible history; it belongs in the backup.
- **Harden the mailbox** (per D2): strict permissions on `export.json`, expiry,
  and cleanup of `inbox/processed/`, which grows without bound.
- **Clear the clipboard buffer.** `copy/serialize.ts:57` stores the last copied
  content in `localStorage` in plain text, permanently, and nothing ever clears
  it. Give it a bounded lifetime.

### Phase 1 — A change counter that can be trusted

Sync needs to answer "what changed since X". Timestamps cannot answer it today:
`storage/ids.ts:6` is wall-clock ISO to the millisecond, so two writes in the
same millisecond are indistinguishable and a backwards clock adjustment hides a
change entirely.

**Reuse the pattern that already exists in this codebase.**
`storage/activity.ts:7-14` solved exactly this with a monotonic `seq` assigned
inside the append transaction, after the same millisecond-tie bug. Generalise
that to every synced table. Do not invent a new mechanism.

This phase is required no matter which sync design wins, so it is safe to build
before any backend exists.

**Where it landed (2026-07-29):** `storage/change-seq.ts` holds one counter for
the whole database — `next = max(now, last + 1)`, with the high-water mark
mirrored to `localStorage` so a restart, or a clock the OS moves backwards,
cannot hand out a number twice. `activity.seq` is left alone: it orders the
bitácora for display and must not shift under a restore.

The stamp is applied by **Dexie `creating`/`updating` hooks registered once per
synced table in `db.ts`**, not at the ~20 repository write sites. A write path
added later cannot forget to stamp, and a change sync never sees is a change
lost; the hooks were verified to fire for `add`, `bulkAdd`, `put`, `update`,
`bulkPut` and `modify`. Restores and undo re-stamp on purpose — locally they
*are* new changes.

Migration v7 indexes `changeSeq` on the seven synced tables (`SYNCED_TABLES` in
`db.ts`; `settings` stays out per `002`) and stamps pre-existing rows, because a
row missing the field is absent from the index and would be invisible to the
first upload. "What changed since X" is therefore
`table.where('changeSeq').above(mark)` — no helper was added, Phase 2 can name
one when it has a caller.

### Phase 2 — Encryption at the upload edge, accounts, upload

- Generate a random **vault key** on the device. It never leaves in plaintext.
- Show a **recovery code** once, at vault creation, with an unambiguous warning
  that losing it makes the notes unrecoverable (see Risks).
- Each approved device holds its own copy of the vault key, wrapped: OS keychain
  on desktop, a non-extractable key in the browser on web.
- Supabase Auth (Google/Apple) identifies the account. It never holds the vault
  key. **Resetting the account password does not decrypt any note.**
- Every record is encrypted **as one blob** just before upload, in the
  repository layer — the seam `AGENT.md:61` already names as "the encryption-
  and sync-readiness seam".
- Row-Level Security so an account can only reach its own rows, with an
  automated test proving one account cannot read another's.
- Explicit consent before the first upload. Nothing leaves the device without it.

**Where the local half landed (2026-07-29).** Everything that needs no account
is built and tested; the cloud half waits on a Supabase project (Hernan chose
email magic-link login for the beta, so no Google/Apple console work is needed).

- `sync/records.ts` — `encryptRecord`/`decryptRecord`, AES-GCM-256 with a fresh
  random IV per write. **The record's identity is the additional authenticated
  data (`table:id`)**, so whoever holds the database cannot move a blob to
  another row or another table: it stops decrypting. In the clear: `id`, table,
  `changeSeq` (the version marker) and the tombstone flag — nothing else, proved
  by a test that greps the payload for the note text, the private comment, the
  due date, the block type and the relation ids.
- `sync/vault.ts` — the vault key is a **non-extractable `CryptoKey`** held in
  the new v8 `vault` table. **Deviation from this spec's "OS keychain on
  desktop":** the Tauri window is a browser, so the same non-extractable key
  covers desktop and web with one mechanism and no Rust dependency, and the
  guarantee is the same one that matters here — not even our own code can read
  the bytes out. The threat model already excludes an attacker at an unlocked,
  authorised machine, which is the only case a keychain would improve.
- Recovery code: 120 random bits as Crockford base32 (`XXXX-XXXX-…`, six groups,
  no I/L/O/U so it survives being read out loud), wrapping the key via
  PBKDF2-SHA256 at 600k rounds. Typing is forgiving (case, spacing, `O`→`0`,
  `I`/`L`→`1`). The code is never stored — a test asserts it is absent from the
  stored row.
- The `vault` table is not in `SYNCED_TABLES` and not in `storage/backup.ts`'s
  table list, so the key never rides inside a plaintext JSON backup. Tested.
- `navigator.storage.persist()` is requested **at vault creation, not at boot**
  (the browser-eviction risk below): a local-only user never sees the permission
  prompt Firefox shows for it.
- **The pending-changes outbox table in the Data Model below is not needed.**
  Phase 1's indexed `changeSeq` already answers "what is not uploaded yet" —
  `where('changeSeq').above(lastUploaded)`, tombstones included, offline edits
  included, with no second write per edit and no table to keep consistent. The
  upload high-water mark is one preference. Decided while building; revisit only
  if per-record retry state turns out to be needed.
- `sync/pending.ts` — `listPendingUploads()` (oldest change first, batched) plus
  `markUploadedThrough()`, which only ever moves forward. **Consent is
  structural, not a reminder someone has to honour: without it
  `listPendingUploads` returns nothing**, so an uploader physically cannot find
  records to send. Both new preferences (`syncConsent`, `syncUploadedThrough`)
  are `backupSafe: false` in `settings-registry.ts` — a consent decision is per
  device, and a restored cursor would silently skip records.

**Where the cloud half landed (2026-07-29).** Everything above plus:

- `supabase/schema.sql` — two tables, `records` (one encrypted blob per synced
  row) and `vaults` (the wrapped key). RLS on both, `using` **and** `with check`,
  so an account can neither read nor write another's rows. `scripts/rls-check.mjs`
  (`pnpm rls:check`) proves it against the real project with two throwaway
  accounts that deliberately share one record id. It is a script, not part of
  `pnpm test`: it needs the service_role key, which only exists locally.
- **Two login paths, one variable (`PUBLIC_SUPABASE_EMAIL_CODE`).** A 6-digit
  email code (`signInWithOtp` / `verifyOtp`) — never a magic link, because the
  desktop app is a webview with no URL bar to return to — and email + password.
  **Password ships as the default**, and the reason is worth recording: with the
  project's own mail service Supabase does not let you edit the template at all
  (so `{{ .Token }}` cannot be added, and the mail carries only a link), and
  Resend over SMTP refuses its own borrowed `onboarding@resend.dev` sender with
  `Domain is not verified` — that shortcut only works from their test API. No
  verified sending domain, no code, nobody logs in. The code path stays live
  code behind the variable, so the day a domain exists the migration is one
  value. Password mode requires "Confirm email" OFF in Supabase, and the app says
  so by name when a sign-up comes back without a session.
- **Deviation: no local `ownerId` column.** Postgres fills `owner_id` from
  `default auth.uid()` and RLS enforces it; a device has exactly one owner, so
  the local column would hold one repeated value. Additive if a second owner per
  device ever exists.
- **Deviation: the server's version marker is a sequence, not a timestamp.** A
  trigger stamps `server_seq` from a Postgres sequence on insert *and* update, so
  phase 3's "changed since X" cannot tie the way `updated_at` could — the same
  reasoning as phase 1's local counter.
- `sync/upload.ts` — list oldest first, encrypt, upsert, and only then advance the
  mark. An interruption between the upsert and the mark re-sends the batch, which
  the `(owner_id, table_name, id)` upsert key turns into an overwrite instead of
  a duplicate. Every gate (no project, no session, no consent, no vault) lives
  inside `syncNow`, so the 30-second clock in `+layout.svelte` is inert on a
  local-only install.
- **The CSP was the trap.** `connect-src` was `'self'` plus the desktop IPC
  origins, so every Supabase call would have been blocked with no visible error.
  `vite.config.ts` now reads the project URL once and feeds both the client and
  `connect-src`; a build without the variable keeps the old "nothing leaves"
  policy.
- **Known cost, already named by phase 3:** creating a note calls
  `shiftRootDown`, which renumbers its siblings' `sortOrder`, and a renumbered row
  is a changed row — so a new note re-uploads the other notes' (small) rows. The
  fix is this phase's "stable positions instead of sequential integers".

Still to build: everything in phase 3 (download, merge, conflicts) and the
second-device screen that feeds `restoreVault()`, which exists and is tested but
has nothing to restore from until download lands.

### Phase 3 — Download, merge, conflicts without losing text

**Where the download half landed (2026-07-30).** A second device joins the vault
with its recovery code and pulls everything down; conflicts are detected and
counted but not yet resolvable on screen (next slice).

- **The trap this phase turns on: `storage/db.ts`'s hooks stamp every write.** A
  record saved as it comes down would look like a local change, upload again, be
  downloaded by the other device, and bounce for ever. `putFromCloud()` is the
  only door in: it marks the row with a transient `fromCloud` flag the hooks
  consume and delete, so the counter it arrived with survives. **The flag is
  explicit rather than an "applying remote" mode on purpose** — a mode would span
  `await`s, and an ordinary save landing inside that window would silently lose
  its stamp, which is losing the change.
- **New field `cloudSeq`** = the version the server already holds. Without it a
  freshly joined device sees everything it just downloaded as pending, re-uploads
  the lot, and shows "822 cambios sin subir" right after syncing. A local edit
  re-stamps `changeSeq`, the two stop matching, and the record is pending again.
  It never travels: stripped in `encryptRecord` and in `backup.ts`'s
  `LOCAL_ONLY_FIELDS`, for the same reason `changeSeq` is — elsewhere the claim
  is false, and a false claim there is a change that never uploads.
- `sync/download.ts` reads by the server's own `server_seq` (the trigger-stamped
  sequence, which cannot tie the way a timestamp can), and the merge policy lives
  in one `decide()` function: unknown record → apply; same counter → my own echo;
  **local has unsent changes → conflict, touch nothing**; otherwise the newer
  counter wins. Cross-device comparison of `changeSeq` is legitimate because
  phase 1 derives it from the clock; a skewed clock can lose a race but never
  text, because the loser lands in the conflict branch.
- Batches are applied record by record, **not** in one transaction: an
  interruption leaves the cursor where it was, the batch is read again, and
  applying the same version twice writes the same bytes.
- **Download does not require upload consent.** Joining the account with the
  recovery code *is* the request, and a device that never consented has nothing
  of its own up there.
- `sync/CloudLifecycle.svelte` (modelled on `bridge/BridgeLifecycle.svelte`) owns
  the clock and refreshes the screen through the same `handleDataChanged()` the
  agent bridge already uses — but only when something actually landed.

**Where the conflict half landed (2026-07-30).** `sync/conflicts.ts` plus a v9
`conflicts` table — device-local like `vault`, outside `SYNCED_TABLES` and
outside the backup's table list, because a decision pending on this machine means
nothing on another one.

- The download parks the remote version instead of applying it; the local row is
  never touched and stays pending, so **both versions exist while the person
  decides**. The id is `table:recordId`, not random, so a newer arrival replaces
  the parked copy rather than piling up choices about the same record.
- **Quedarme con el mío** just drops the parked copy: the local row is already
  pending, so the next sync pushes it and the other device converges on it.
  **Traer el otro** writes through `putFromCloud`, so the version taken does not
  come back up as a brand-new local change.
- Delete there + edit here: the edit wins by construction — a tombstone with
  local unsent changes lands in the same conflict branch as any other version,
  and the deletion is what gets parked.
- The count shown is the standing pile (`countConflicts()`), not what the last
  run happened to find: a conflict stays open until someone decides it.

Still to build: phase 3's stable list positions — see the deviation below — and
the "in seconds" work (upload on idle + presence + a single broadcast nudge,
switched on only while a second device is actually connected, which is what keeps
Supabase's per-message realtime billing near zero).

**Deviation, deliberate: list order stays sequential integers.** This phase was
supposed to replace `sortOrder` with stable positions. It is not text, so a
disagreement between devices reorders a list at worst, never loses a word; and
the change touches every drag-and-drop path in the app. Deferred until the
churn is a real complaint rather than a predicted one.

- Edits to different blocks merge automatically.
- The same block edited on two devices keeps **both** versions and asks.
- Delete on one device + edit on another keeps the edit as a recoverable version.
- List order uses stable positions, not the current sequential `order` integers.
- The bitácora merges by record id, not by each device's clock.
- No content conflict is ever resolved by a silent "last write wins".

### Phase 4 — Gradual rollout

1. Encrypted upload from one device only, changing nothing on others.
2. Controlled download onto a second device.
3. Two-way sync.
4. A switch that turns the cloud off without blocking local access.
5. An independent security audit **before** the words "zero-knowledge" appear in
   any public-facing copy.

## What Does NOT Enter

- No encryption of IndexedDB, the unload journal, or local JSON backups (D1).
- No "Lock CopyNotes" / vault-unlock UI in this spec.
- No removal of `export.json` and no "app must be open" rule for MCP (D2).
- No real-time collaborative editing, no teams, no org admin (inherited from `029`).
- No paywalling local note-taking — local stays free forever (`AGENT.md`).
- No public zero-knowledge claim before the Phase 4 audit.

## Threat Model

Stating this precisely matters more than the crypto, because it is what the
product may honestly promise.

**Protected against:** Supabase as a company, CopyNotes as a company, a breach
or leak of the Supabase database, a legal demand served on Supabase, and anyone
intercepting traffic. None of them can turn stored bytes into readable notes.

**Not protected against:** anyone with access to an unlocked, already-authorised
device; the local disk at rest (that is FileVault's / BitLocker's job); the
clipboard and screenshots; text the user deliberately shares with an agent
wired to a remote model.

**Metadata Supabase still sees:** account identity, IP address, approximate
record counts, payload sizes, and sync timing. This is unavoidable in this
architecture and must be said plainly in the privacy copy.

## Data Model

Every synced record uploads in this shape — everything meaningful lives inside
the ciphertext:

| In the clear | Encrypted (inside one blob) |
|---|---|
| `id` (random UUID, carries no meaning) | content, `html`, title |
| `ownerId` | the private block comment (`note`) |
| table name | `dueDate`, `checked`, `type` |
| server sequence number | relations (`noteId`, `parentBlockId`, `folderId`) |
| a deleted flag (tombstone) | tag names, folder names, snippet name and content |
| a version marker for conflicts | activity text |

Local additive migration (v7 or later; v1→v6 are all additive, so this is cheap):

- `ownerId` per synced record — the one seam `029` deliberately deferred.
- A persistent **pending-changes outbox** table: every edit writes the record
  and its outbox entry together, so an edit made offline is never lost.
- The Phase 1 monotonic sequence number, plus the server-assigned sequence.

Settings stay last-write-wins keyed preferences, not documents (per `002`), and
flow through `settings-registry.ts` as they already do.

## User Flows

- User creates an account and a vault, saves the recovery code, gives explicit
  consent, and the first encrypted upload happens.
- On a second device the user logs in and supplies the recovery code (or, later,
  approves from an already-trusted device); the vault key unwraps locally and
  the notes download and decrypt.
- Editing offline keeps saving normally; the outbox drains when the connection
  returns, using ids that prevent duplicates.
- Closing CopyNotes waits for the **local** save only, never for the network.
- A user can stay fully local forever, with no account. Free tier, unchanged.

## Acceptance Criteria

- A record captured on the wire, or read directly out of the Supabase table, is
  unreadable without a device key or the recovery code. Provable by a test that
  greps the stored payload for known note text and finds nothing.
- Resetting the account password does not grant access to any note.
- An account cannot read another account's rows (enforced server-side, tested).
- The first upload requires explicit consent.
- Deletes propagate as tombstones.
- A conflict preserves both versions; no silent text loss.
- **Local behaviour is unchanged:** the unload journal still runs synchronously,
  every existing index still serves its query, and the offline app never blocks
  on the network.
- The app is fully usable offline without an account.

## Minimum Tests

Phase 0/1:

- The change counter never repeats and never goes backwards, including two
  writes inside one millisecond and a backwards system-clock change.
- The backup round-trip preserves `activity`.
- The clipboard buffer does not outlive its bounded lifetime.

Phase 2/3:

- Stored payload contains no plaintext note content (the grep test above).
- Cross-account read isolation.
- Upload blocked until consent.
- Conflict keeps both versions.
- Tombstone propagation deletes on the second device.
- Offline edits survive a restart and drain from the outbox on reconnect.

## Risks And Known Ceilings

- **Recovery-code loss is unrecoverable.** This is the price of zero knowledge.
  It must be stated on the screen that shows the code, not only in a document.
- **Browser storage eviction (web only).** Nothing in the code calls
  `navigator.storage.persist()`, so the browser may drop site data; Safari
  evicts after roughly a week of disuse on non-installed sites. Today the JSON
  backup rescues that. Once a device key lives in browser storage, losing it
  means re-downloading from the cloud and unwrapping with the recovery code.
  Request persistent storage before Phase 2 ships on web.
- **Device revocation and key rotation** are named, not designed. Decide at
  build time; both are additive to the wrapped-key table.
- **`journal.ts` must stay synchronous.** Any future change that makes the
  `pagehide` path await anything reintroduces the data-loss bug D1 avoids.
- **Cost:** Supabase Pro from roughly US$25/month. Encryption barely moves that;
  the real cost is building it and proving no failure mode loses notes.

## Agent Notes

- **Build order is the phase order.** Do not start with the conflict UI.
- **Reuse, don't replace.** The sync engine wraps the existing repositories; it
  is not a parallel data model. `028` and `029` share the same seam.
- **Reuse `seq`.** `storage/activity.ts` already solved the monotonic-counter
  problem in this codebase. Copy it; do not design a new one.
- **Never touch the synchronous `pagehide` path** in `journal.ts` /
  `Editor.svelte`. If a future phase ever needs encrypted journal entries,
  encrypt eagerly when the save is scheduled and keep the finished ciphertext in
  memory, so unload only performs an already-prepared synchronous write.
- The localStorage journal is a local durability mechanism, **not** a sync log.
  Keep them separate (inherited from `029`).
- Encryption belongs in the repository layer, the seam `AGENT.md:61` already
  designates. UI components must stay unaware.

## Corrections To Existing Specs And Docs

- **`029` acceptance criterion "A 'changed since T' query exists or is trivially
  addable" is false today.** Wall-clock timestamps cannot support it. Phase 1
  replaces it; update `029` rather than adding to it.
- **`029`'s "encryption in transit/at rest out of the box" (Supabase-provided)
  is superseded.** Encryption happens on the device, before upload.
- **`docs/zero-knowledge-sync.md`'s "private comments could reach MCP files" is
  stale.** `bridge/export.ts:32-46` copies only allow-listed fields and
  physically discards the `note` comment and `html`; the omission is documented
  there as a deliberate second lock. No work needed.

## Related Specs

- `029` — the account/sync road this spec makes zero-knowledge.
- `010` — sync readiness; backend stays open, Supabase leads.
- `002` — data model, stable ids, soft delete, settings-as-preferences.
- `028` — agent beta; owns the MCP bridge this spec hardens instead of removing.
- `012` — MCP permissions and audit; Phase 0's consent-copy fix belongs to it.
