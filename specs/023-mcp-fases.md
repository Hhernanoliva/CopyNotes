# 023 - MCP Phasing And Conservative First Version

## Objective

Consolidate the *order* in which CopyNotes reaches MCP and define the deliberately conservative first version of external agent access. This spec is the map; the detail stays in `011-mcp-readiness` (what gets exposed) and `012-mcp-permissions-audit` (permissions, audit, control). Nothing here is built in the current phase — this is a strategy record so future work starts from a shared, ordered plan instead of improvising a large MCP system.

Written 2026-07-18 after an external strategy review that matched the existing MCP direction. This spec captures only what that review *added*: a concrete phase order, a conservative first cut, and a few prioritization calls.

## What Enters

- A six-step build order from "no MCP" to "multi-agent / cloud".
- A concrete, conservative definition of the first real MCP version.
- Prioritization decisions: prompts are reusable snippets, not the centerpiece; human-facing task organization comes first.
- The framing of a single internal task-action layer shared by people and agents.
- The known preconditions (blockers) that must be resolved before agents can connect.

## What Does NOT Enter

- No code this phase. This is a documentation-only spec.
- No cloud backend, no multi-agent, no accounts brought forward.
- No new data path: agents, when they arrive, act only through the storage layer / repositories, never directly on the UI or Dexie.
- No user-facing AI chat inside CopyNotes (unchanged product rule).
- No change to the existing MCP contracts in `011`/`012`; this spec sits on top and links to them.

## Build Order (The Roadmap)

1. **Make human task organization excellent** — pending / in progress / blocked / done visible and pleasant, without any MCP. Pure user value, zero architecture risk. This is the work already covered by `021` (dates/agenda) and `022` (sidebar organization).
2. **Single internal task-action layer** — one place to create, edit, and complete tasks that both CopyNotes UI and future agents call. Invisible to the user; it is the seam that keeps agent actions from becoming a second, divergent code path. Consistent with AGENT.md's "storage layer is the only data path".
3. **Permissions, privacy, and action history** — the trust machinery from `012`: permission presets, read/write scope, private-note enforcement by internal flag, per-agent pause/resume/revoke, a persistent activity log. Must exist before any agent can connect.
4. **Local read-only MCP, one note** — first real connection: a single agent, local/desktop (Tauri) or a small local bridge, reading exactly one authorized note. No writes.
5. **Small write actions** — create tasks, add subtasks, update task states; still scoped and confirmed per `012`.
6. **Multi-agent, sync, cloud** — only after the above are stable. Depends on `010` (sync readiness) and accounts.

## The Conservative First Version (Phases 4–5)

When the first connecting agent ships, it stays intentionally small to protect the user's trust:

- One agent connected at a time.
- Read scope limited to notes tagged `#agent`, or a single chosen note (`#agent` is a UI shortcut only; the real rule is the internal privacy/scope flag, per `012`).
- Can read and create tasks.
- Can *propose* marking a task done; the person confirms. No silent completion.
- Cannot delete, export, or bulk-reorder without explicit permission.
- Every change is visible in a simple activity view.

This is enough to validate whether agent assistance adds real value, without turning CopyNotes into a technical control panel.

## Prioritization Decisions

- **Prompts are reusable snippets, not the centerpiece.** The prompt/workflow ideas in `011` remain valid, but the clearest early value is people always seeing what is pending, in progress, blocked, or changed — not an AI prompt hub.
- **People before agents.** Step 1 (human task UX) must feel excellent before any MCP work begins.
- **Shared task-action layer before permissions.** Step 2 gives step 3 a single surface to gate; gating a scattered set of write paths is where trust bugs hide.
- **Binary checkbox, not four task states** (Hernan, 2026-07-19). The step 1 headline's "pending / in progress / blocked / done" is dropped as too complex. A todo's checked/unchecked state already tells both the person and a future agent whether the task is done. No `status` field, no state model — keep the existing checkbox. This supersedes the four-state wording in the Build Order and the "Task states" precondition below.
- **"AI-touched" mark belongs to step 3, not to dates** (Hernan, 2026-07-19). Idea: when an agent changes something in a note, leave an automatic dated trace so the person can see what the agent did and when. This is *audit history*, distinct from spec 021's user-chosen `dueDate` (due dates). It requires an agent that can write, which does not exist before step 4, and its natural home is the step 3 activity log / action history. Recorded here as intent; design deferred, no code now.

## Preconditions / Known Blockers

- **Reach.** Notes live only inside each person's browser. An external agent cannot reach them without a desktop app (Tauri, the preferred path) or a small local bridge. Document browser limits honestly rather than assuming the browser can do everything.
- **Trust machinery.** Permissions, private-note enforcement, and a durable action history do not exist yet. The current undo is per-session and per-note; it is not a substitute for reviewing what an agent did days later.
- **Task states.** The model must be able to represent pending / in progress / blocked / done before agent workflows need them, even if the UI stays simple. (Already flagged in `011`.)

## Acceptance Criteria

- The six-step order and the conservative first version are recorded and linked from `011` and `012`.
- No step earlier than step 3 assumes any agent can write.
- The first agent version, as described, never completes, deletes, exports, or bulk-reorders without user confirmation.
- Human task organization (step 1) is treated as a prerequisite, not a parallel nice-to-have.
- Nothing in this spec contradicts AGENT.md or `010`/`011`/`012`.

## Minimum Tests

None this phase — documentation only. Tests arrive with the code they cover: the task-action layer (step 2) and the permission/scope helpers (step 3) inherit the test expectations already listed in `011` and `012` (resource shape serialization, permission preset mapping, read/write scope allow/deny, private-note protection, dangerous-action confirmation, audit-log creation, pause/revoke enforcement).

## Agent Notes

MCP is a strategic future capability, not current work. Do not let it distract from post-MVP hardening. When the time comes, start at step 1 and never skip the trust machinery (step 3) to reach a demo faster. The whole point of the conservative first version is that the user can always understand and stop what an agent is doing.

## Related Specs

- `010-sync-readiness` — accounts and sync that phase 6 depends on.
- `011-mcp-readiness` — what MCP exposes (resources, tools, prompts) and audience.
- `012-mcp-permissions-audit` — permissions, sessions, audit, private notes, rollback.
- `021-dates-agenda`, `022-sidebar-organization` — the human task organization that is step 1.
