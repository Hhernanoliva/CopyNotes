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
  second data path. Scope: create, complete, redo (untick + instruction), read.
  Text edits and deletions are NOT in it — see the `action` list below.
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

## v2 — Lectura Markdown y privacidad por tipo de contenido (2026-07-25)

Diseño y medición: `docs/superpowers/specs/2026-07-25-canal-agente-v2-lectura-md-permisos-design.md`.
Plan: `docs/superpowers/plans/2026-07-25-canal-agente-v2-lectura-md.md`. Esta sección
prima sobre las descripciones v1 de lectura de abajo cuando difieran.

**Qué lee el agente (por nota visible), como Markdown, no JSON:**

- Título de la nota y **nombre de su carpeta** (`folderId` → nombre).
- **Prosa como contexto**: los bloques de texto (`text`/`bullet`/`heading1..3`/`code`)
  se proyectan como Markdown. Es contexto para las tareas, no algo que el agente
  reescriba.
- **Solo tareas pendientes** (`checked !== true`), con **id corto** (prefijo de 8,
  alargado ante colisión). El server MCP re-expande corto→UUID antes de submitear
  un cambio; la app siempre ve UUIDs completos.
- La **bitácora NO** viaja en la lectura: es **bajo demanda** vía la tool
  `get_task_history`. Es el mayor ahorro de tokens (medido: lectura de una nota
  real baja de ~2.772 a ~211 tokens).

**Privacidad por tipo de contenido** (el modelo pasa de "doble candado" único a
candado por contenido):

- Prosa de una nota 🤖 → **candado simple**: la protege solo la bandera
  `agentVisible` (opt-in consciente por nota).
- **Comentarios** (`block.note`) → **doble candado**: se descartan físicamente en
  el export, de cualquier nota; nunca salen.
- Tareas completadas, bitácora inline, timestamps y UUIDs largos → no viajan.
- Las **notas de bitácora escritas por el agente** no se le devuelven al agente
  (no re-lee lo suyo); las **tareas pendientes creadas por el agente sí** se
  muestran (ocultarlas causaría duplicados y tareas que no podría completar).

**Descubrimiento + lectura como tools:** además de exponer las notas como
**recursos** MCP, hay dos tools de solo-lectura — `list_notes` (notas visibles:
nombre + id corto) y `read_note` (una nota por id corto o **nombre** → el mismo
Markdown que el recurso). Motivo: la mayoría de clientes no le pasan los recursos
al modelo por su cuenta (el usuario tiene que adjuntarlos a mano), así que un
prompt natural ("entrá a la nota X y hacé lo anotado") no llega a la nota por el
recurso. Las tools sí son siempre visibles para el modelo → el flujo anda sin
que el usuario pegue ids. Mismas reglas de privacidad (solo notas 🤖, sin
comentarios, completadas ocultas en el Markdown).

**Escritura:** sin cambios de poder — mismas 3 tools (`create_task`,
`complete_task`, `add_note`) + `get_task_history`. La "voz" del agente reutiliza
`add_note` (bitácora, `action: 'note'`, `actor` = agente) y la app la muestra
**inline bajo la tarea en ámbar + cursiva + marca "IA"**, junto al comentario del
usuario, sin tocarlo. El agente no reescribe la prosa del usuario.

**Export:** versión 2. `{ format, version: 2, notes: [{ id, title, folder,
blocks: [...] }] }`, bloques en orden de documento (`flattenTree`), tareas con
`activity` embebida (para la tool de historial) — pero esa `activity` NO se
proyecta en la lectura Markdown.

## What Does NOT Enter

- ~~No cloud, no accounts, no multi-device (that is `029`).~~ **Superseded
  2026-07-30:** `029`/`030` phases 0–3 are in production, and the two channels
  coexist without either knowing about the other. What that means, verified in
  `bridge/ingest.test.ts` ("agent writes and the cloud"): an agent write lands
  through the ordinary repositories, so `db.ts`'s per-table hooks stamp its
  `changeSeq` and it uploads encrypted like any local edit; a cloud arrival
  reaches the agent through `handleExternalChange` → `bumpAgentData()`, which
  re-exports the mailbox; and `agentVisible` rides on the note row, which is a
  synced table, so visibility follows the note across devices. Upload consent and
  agent visibility stay independent permissions — `sync/pending.ts` hands out
  nothing before consent, whoever wrote it. Still out of scope: an agent reading
  a device whose app is closed sees that device's last export, and the browser
  build runs no bridge at all.
- No multiple simultaneous agents (single-agent v1).
- No agent writing prose or free note content — agents act on **tasks and
  structured metadata only**, never rewrite a note's body. (v2: the agent *reads*
  the note's prose as context and *writes* an amber "IA" bitácora note shown under
  the task — but it never edits the user's own prose or comments.)
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
- `action` — `created` | `done` | `reopened` | `note`. Those four and no more:
  editing a task's text and deleting it deliberately leave NO entry (decided
  2026-08-01), so they stay on the plain block repositories instead of routing
  through `lib/tasks`. An edit would append one line per debounced save — noise
  the user guide already promises does not happen — and a deleted task is
  unreachable for the agent anyway, since `getBlock` filters soft-deleted rows
  before the ingest gate ever answers. An earlier draft listed `edited`; it was
  never produced by any caller and is gone.
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
4. **Phase 1** — the agent reads agent-visible notes: title, folder, prose as
   context, and pending tasks, projected as Markdown (read-only; see v2 section).
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
- (v2) A block's **comment** (`block.note`) never appears in the export, from any
  note — covered by a test.
- (v2) Read is projected as **Markdown** (title + folder + prose context + pending
  tasks with short ids); the bitácora is not inline, only via `get_task_history`.
- Every agent write produces exactly one activity entry.
- Completing a task sets `checked = true` **and** appends a `done` entry carrying
  actor and timestamp. Completion **cascades exactly like the UI** (specs/003): the
  done value flows to todo children and mirrors up through todo ancestors, in one
  atomic write; the agent's summary lands on the target's `done` line, cascaded
  blocks get an empty one. Completing an already-done task never reopens it.
- (v2) Completed tasks are **hidden from the Markdown read** but still carried in
  `export.json` (with `checked` + bitácora), so `add_note` and `get_task_history`
  work on a task the agent has just completed — the short-id pool resolves against
  the export, not the pruned Markdown.
- Uncheck + a user `note` entry round-trips as "reopen/redo" the agent can read.
- The bridge is desktop-only: the browser build runs no mailbox, no watcher and
  no export — nothing an agent can read or write. The ONE agent control it does
  keep is the note header's `agentVisible` toggle, because that flag is a synced
  note field: setting it in the browser prepares what the desktop app will expose
  when it opens. It must say so — its label and tooltip carry "solo tiene efecto
  en la app de escritorio" off desktop (`e2e/agent-visibility.spec.ts`). Settings
  › Agentes stays fully hidden there, since none of it is actionable.
- The agent cannot delete, export, or bulk-reorder in v1.
- Every new persisted field keeps stable id + timestamps + soft-delete discipline
  (cloud-ready per `029`).

## Minimum Tests

- **Task-action layer:** create / complete / reopen a task updates the block and
  appends the correct activity entry.
- **Agent-visibility gate (privacy-critical):** the export includes only
  `agentVisible` notes; a non-visible note is excluded.
- **(v2) Comment privacy:** `block.note` never appears in the export payload.
- **(v2) Markdown projection:** a note projects to Markdown with folder header,
  prose context and pending tasks (short ids); completed tasks, comments,
  bitácora, timestamps and long UUIDs are absent.
- **(v2) Short-id round-trip:** a short id from the read expands back to the real
  UUID for a tool call (`expandId`/`expandArgs`).
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
