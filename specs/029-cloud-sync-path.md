# 029 - Cloud Sync Path (Pro): Accounts, Seams, Conflicts

## Objective

Record the complete, buildable road to **optional** cloud sync with accounts — a
future paid Pro tier — so that when it is built it is *connect the dots*, not a
rewrite. This spec builds **no** infrastructure, creates **no** accounts, and
locks **no** backend in this phase.

It is the practical successor to `010` (sync readiness): `010` says "stay ready";
`029` writes down exactly the path, what is already in place, what the agent beta
(`028`) adds along the way, and the one seam deliberately deferred to build time.

Written 2026-07-23 after a brainstorm with Hernan. Product framing: the desktop
app stays **free and fully local**; cloud sync is the **paid Pro** value
(multi-device). The two are independent tracks — cloud must never block the agent
beta (`028`).

## What Enters (as recorded direction, not code)

- **Local-first model.** The device stays the primary store. Cloud is a
  synchronized copy layered on top — "sync above local", not "move all notes to a
  server". The app keeps working offline without an account, forever.
- **The sync seam is the existing single data path** (repositories +
  `028`'s task-action layer). A future sync engine wraps it; the UI stays unaware.
- **Change-tracking readiness** — a "what changed since timestamp T" capability
  over the repositories, built cheaply during `028`. It is the change feed a sync
  engine pulls from.
- **Tombstones = the existing soft delete** (`deletedAt`) — so a delete
  propagates between devices instead of the row resurrecting.
- **Deferred: per-record `ownerId`.** Added when accounts land. An additive
  migration, cheap in this codebase (v1→v5 are all additive). This is the single
  intentionally-deferred seam; adding it now would be dead weight full of nulls.
- **Conflict policy: never lose text.** On a true conflict (same record edited on
  two devices), preserve **both** versions and surface a choice; never silently
  overwrite. Version/rev metadata is prepared; the merge UI is deferred.
- **Backend candidate: Supabase** (Postgres + Auth + Row-Level Security +
  storage): login with Google/Apple, per-user row isolation, and encryption in
  transit/at rest out of the box — chosen to avoid hand-rolling security. Named as
  the leading candidate, not locked; `010` keeps the backend open.
- **Consent + privacy.** Nothing leaves the device without explicit account
  creation and upload consent. Each user reads only their own rows (enforced
  server-side). The free/local tier keeps zero server-side personal data.

## What Does NOT Enter

- No accounts, login, or backend built in this phase.
- No real-time collaborative editing (two people, one note, live) — out of scope;
  this is single-user, multi-device sync.
- No teams or org admin.
- No paywalling local note-taking — local stays free forever (AGENT.md rule).
- No redesign of local encryption now.

## Model Of Data Affected (readiness view)

Already sync-shaped (stable id + `createdAt`/`updatedAt` + `deletedAt`):

- notes, blocks, snippets, tags, tagAssignments, folders
- `028`'s new `activity` table, `agentVisible`, `createdBy`

Deferred, additive, added at build time:

- `ownerId` on each synced entity (with accounts).
- A per-record conflict marker — `rev`/version or `serverUpdatedAt` — chosen at
  build time; the model must leave room for it.

Exception: **settings** stay last-write-wins keyed preferences, not documents
(as documented in `002`).

## User Flows (future)

- User creates an account (Google/Apple) — opt-in.
- App asks explicit consent, then uploads local data.
- On a second device, the user logs in; the app downloads and merges.
- An edit on device A and a different edit on device B to the same item →
  the app preserves both versions and asks which to keep. Text is never silently
  lost.
- A user can stay fully local forever, with no account (free tier).

## Acceptance Criteria — Readiness We Hold Now (verifiable today)

- No code assumes a single device forever (`010`).
- UI never depends on Dexie details; all data flows through repositories /
  the task-action layer (the sync seam).
- Every persisted entity has stable id + timestamps + soft delete (settings
  excepted per `002`).
- A "changed since T" query exists or is trivially addable over the repositories.
- Adding `ownerId` later is an additive migration, not a rewrite (the v1→v5
  pattern proves this is cheap here).
- The agent beta's new data (`activity`, `agentVisible`, `createdBy`) is itself
  sync-shaped.

## Acceptance Criteria — The Future Build (target definition)

- Local-first preserved: the app is fully usable offline without an account.
- Per-user isolation enforced server-side (Row-Level Security), not only in the
  client.
- Explicit consent required before the first upload.
- Conflicts preserve both versions; no silent text loss.
- Deletes propagate as tombstones (a delete on one device deletes on the other).

## Minimum Tests

Now (readiness):

- The "changed since T" helper returns only records updated after T, including
  soft-deleted tombstones.
- Creating any entity yields a stable id and timestamps (shared with `002`/`010`).

Future (with the build):

- Auth gate; per-user read isolation (a user cannot read another user's rows).
- Upload requires explicit consent.
- Conflict preserves both versions.
- Tombstone propagation deletes on the second device.

## Agent Notes

- **Build order:** accounts/auth → consent upload → download/merge → conflict
  handling. Do not start with the conflict UI.
- **Reuse, don't replace:** the sync engine wraps the existing repositories; it is
  not a parallel data model. The agent beta (`028`) and cloud (`029`) share one
  seam — harden it once.
- When picking `ownerId` and the conflict marker, keep them additive; the
  codebase's migrations show additive changes are cheap here.
- Backend stays open (`010`); Supabase leads because it provides managed auth +
  RLS + encryption, so security is not hand-rolled.
- The persistence journal (localStorage journal + boot replay) is a local
  durability mechanism, not a sync log; keep them separate.

## Related Specs

- `010` — sync readiness this spec turns into a concrete road.
- `002` — data model, stable ids, soft delete, settings-as-preferences.
- `028` — the agent beta whose task-action layer is this spec's sync seam.
- `025` — desktop shell; a synced desktop + web is a later milestone.
