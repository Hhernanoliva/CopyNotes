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

### Phase 3 — Download, merge, conflicts without losing text

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
