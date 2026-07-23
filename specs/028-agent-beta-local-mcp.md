# 028 - Agent Beta: Local MCP, Task-Action Layer, Activity Log

## Objective

Ship the first real external-agent connection: a single **local** agent (a
coding or desktop AI client running on the same machine) that reads the notes
the user marks "visible to agents" and, in a second phase, creates and completes
tasks. Desktop-only (Tauri), no cloud, conservative by design.

This is the practical execution of the strategy already recorded in `011`
(what MCP exposes), `012` (permissions/audit) and `023` (phasing). It builds
steps 2–5 of the `023` roadmap. It ships as a **free** capability of the desktop
app — no account, no server, no personal data leaving the device — so the beta
can validate the single open question: *does agent assistance on CopyNotes add
real value?*

Written 2026-07-23 after a brainstorm with Hernan that (a) confirmed the
desktop-first / local-first path, (b) chose the activity-log ("bitácora")
communication model, and (c) relaxed the "propose only" completion rule — see
Agent Notes.

## What Enters

- **Task-action layer** — one module (`src/lib/tasks/`) that is the single place
  to create, edit, complete, reopen, and read tasks. Both the app UI and the
  agent bridge call it. It wraps the existing block repositories; it is not a
  second data path.
- **Per-task activity log ("bitácora")** — an ordered list of small entries
  recording who did what and when on a task. Powers the agent↔user back-and-forth
  *and* the audit history `012` asks for. Stored in a dedicated `activity` table
  (not inline on the block) so it stays audit-shaped and syncs granularly.
- **Task origin** — a task records whether the user or an agent created it, so
  agent-built tasks are distinguishable (the agent may leave tasks for future use).
- **"Visible to agents" note flag** — an internal per-note boolean that is the
  source of truth, toggled by a new control in the note header. An optional
  `#agente`-style tag is only a UI shortcut, never the real gate. Default: off —
  the agent sees nothing until the user opens a door.
- **Buzón bridge (Tauri)** — the reach mechanism. The webview exports
  agent-visible notes and their tasks to a folder the Rust side owns; the Rust
  side watches for agent edits and hands changes back to the webview to ingest
  through the storage layer. **Phase 1: read-only** (export out only).
  **Phase 2: two-way** (ingest create-task / complete / append bitácora).
- **Conservative trust surface (v1)** — one agent at a time; scope limited to
  agent-visible notes; every agent write leaves exactly one bitácora entry; the
  agent may mark a task done directly but always leaves a trace line.
- **Settings > Agentes view** — a minimal read-only list of recent agent activity,
  read from the activity log.

## What Does NOT Enter

- No cloud, no accounts, no multi-device (that is `029`).
- No multiple simultaneous agents (single-agent v1).
- No agent writing prose or free note content — agents act on **tasks and
  structured metadata only**, never rewrite a note's body.
- No AI chat inside CopyNotes (unchanged product rule).
- No delete, export, or bulk-reorder by the agent without explicit confirmation.
- No browser/PWA agent connection — reach is desktop-only; the browser limit is
  documented, not worked around.
- No full agent registry / sessions / per-agent pause-resume-revoke yet — those
  from `012` arrive when a second agent does.

## Model Of Data Affected

### Note (added field)

- `agentVisible`: boolean, default `false`. Internal source of truth for scope.
  The header control sets it; a tag is only a shortcut.

### Block / Task (added field)

- `createdBy`: `'user'` or an agent id. Defaults to `'user'`. Cheap, additive,
  cloud-friendly.
- The task's done state stays the existing binary `checked` (no `status` field —
  consistent with `023`).

### Activity (new table)

One append-mostly row per event on a task:

- `id` — stable id
- `blockId` — the task it belongs to
- `noteId` — denormalized for per-note and global activity views
- `actor` — `'user'` or an agent id
- `action` — `created` | `done` | `reopened` | `note` | `edited`
- `text` — optional (a completion summary, or the user's "redo: …" instruction)
- `at` — timestamp
- `deletedAt` — soft delete, for consistency with the rest of the model

The activity table **is** the `012` "Agent Action History" entity, arriving early
because the beta needs it for the agent↔user channel.

### Connected agent (minimal, v1)

A single stored agent identity (id + display name) is enough for v1; the full
`012` registry is deferred. Every entity above uses stable ids, `createdAt`/
`updatedAt` where applicable, and soft delete — so `029` (cloud) carries them
without redesign.

## User Flows

1. User toggles **"Visible para agentes"** in a note's header.
2. User writes tasks (todo blocks) in that note; optionally leaves the
   instruction/prompt in the task text.
3. User points their local agent (coding or desktop client) at the CopyNotes
   bridge.
4. **Phase 1** — the agent reads agent-visible notes and their tasks (read-only).
5. **Phase 2** — the agent creates a task, or completes one: it sets `checked`
   and appends a `done` activity entry with actor + timestamp (and an optional
   one-line summary).
6. User reviews. If the result is wrong: the user **unchecks** the task and adds
   a `note` activity entry, e.g. "Rehacer: <new instruction>".
7. The rule the agent follows: **unchecked + last activity is a user instruction
   = reopen/redo**; **checked = done, leave it alone** (unless unchecked again).
8. User opens **Settings > Agentes** to see recent agent activity.

## Acceptance Criteria

- The task-action layer is the **only** write path used by both the UI and the
  bridge; there is no second data path, and neither touches Dexie directly.
- `agentVisible === false` notes never leave the app through the bridge —
  enforced at the export boundary and covered by a test.
- Every agent write produces exactly one activity entry.
- Completing a task sets `checked = true` **and** appends a `done` entry carrying
  actor and timestamp.
- Uncheck + a user `note` entry round-trips as "reopen/redo" the agent can read.
- The bridge is desktop-only; the browser build exposes no agent surface.
- The agent cannot delete, export, or bulk-reorder in v1.
- Every new persisted field keeps stable id + timestamps + soft-delete discipline
  (cloud-ready per `029`).

## Minimum Tests

- **Task-action layer:** create / complete / reopen a task updates the block and
  appends the correct activity entry.
- **Agent-visibility gate (privacy-critical):** the export includes only
  `agentVisible` notes; a non-visible note is excluded.
- **Ingest gate:** every agent-written field passes `format/ingest.ts` +
  `sanitize.ts` — agent input is untrusted external input, like paste/backup.
- **Activity log:** entries carry actor/action/at and order by `at`.
- **Redo round-trip:** uncheck + user instruction is readable as reopen.

## Agent Notes

- The bridge is the only new data path and it MUST call the task-action layer /
  repositories, never Dexie directly (AGENT.md rule and the sync seam for `029`).
- **Agent input is untrusted.** Route every agent-written field (task text,
  bitácora text) through the HTML ingest gate exactly like paste, backup, and
  snapshot restore. See `018` and the ingest gate; `block.html` is a stored-XSS
  sink if raw text is stored without escaping.
- **Hernan's 2026-07-23 decision:** the agent marks tasks done **directly** (this
  relaxes `023`'s "propose, user confirms" for the *done* action), but must leave
  a trace line; the user's uncheck + instruction is the rejection/redo channel.
  Every other conservative limit in `023`/`012` still holds. Recorded here so the
  variance from `023` is explicit, not accidental.
- Keep `createdBy` and activity entries cloud-friendly: stable ids, timestamps,
  actor strings — so `029` sync carries them without redesign.
- Desktop keeps IndexedDB (`025`); the bridge moves data webview↔Rust via Tauri
  IPC and lets Rust own the folder. Do not migrate storage to SQLite for this.

## Related Specs

- `011` — what MCP exposes (resources, tools, prompts) and audience.
- `012` — permissions, sessions, audit, private notes; the activity table is its
  action-history entity arriving early.
- `023` — the six-step phasing; this spec builds steps 2–5.
- `025` — the Tauri desktop shell the bridge runs inside.
- `018` — the backup/ingest format contract the bridge validates against.
- `029` — the cloud path that shares this spec's task-action layer as its seam.
