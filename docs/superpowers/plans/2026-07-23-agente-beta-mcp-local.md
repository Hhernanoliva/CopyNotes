# Agente Beta — MCP Local, Capa de Tareas y Bitácora (spec 028) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first real local external-agent connection for CopyNotes desktop (Tauri): a single agent can read notes the user marks "visible to agents" and, in a second phase, create/complete tasks — every change routed through one shared task-action layer and recorded in a per-task activity log ("bitácora").

**Architecture:** A new pure-JS foundation (data model + `src/lib/tasks/` task-action layer + `src/lib/bridge/` gate) is the only write path both the app UI and the agent bridge use; it wraps the existing storage repositories and never touches Dexie directly. On top sits the Tauri "buzón" bridge: the webview exports agent-visible notes to a folder the Rust side owns (Phase 1, read-only) and later ingests agent edits back through the ingest gate + task-action layer (Phase 2, two-way). Everything uses stable ids + timestamps + soft-delete so spec 029 (cloud) carries it without redesign.

**Tech Stack:** SvelteKit + Svelte 5 (runes) · TypeScript tooling / plain-JS style · Dexie/IndexedDB · Valibot · Tauri 2 (Rust, `notify` crate) · Vitest (node + jsdom projects) · Playwright.

## Global Constraints

- **Storage is the only data path.** The bridge and task-action layer MUST call repositories / the task-action layer, never Dexie directly (AGENT.md; spec 028 Agent Notes; the sync seam for 029).
- **Agent input is untrusted.** Route every agent-written field (task text, bitácora text) through the HTML ingest gate (`src/lib/format/ingest.ts` + `sanitize.ts`) exactly like paste/backup/snapshot. `block.html` is a stored-XSS sink if raw text is stored unescaped.
- **Privacy gate is source of truth.** `note.agentVisible === false` notes MUST never leave the app through the bridge — enforced at the export boundary and covered by a test. Default `agentVisible = false`.
- **Every agent write produces exactly one activity entry.** Completing a task sets `checked = true` AND appends one `done` entry carrying actor + timestamp.
- **Agent may mark done directly** (Hernan 2026-07-23 decision, relaxes 023's "propose, confirm") but always leaves a trace line; the user's uncheck + `note` instruction is the rejection/redo channel. Every other conservative limit in 023/012 still holds: single agent, tasks/metadata only (never note prose), no delete/export/bulk-reorder.
- **Desktop-only reach.** The bridge is Tauri-only; the browser/PWA build exposes no agent surface. Runtime detected via `isTauriRuntime()` (`src/lib/platform/runtime.ts`).
- **Cloud-ready discipline.** Every new persisted field keeps stable id (`createId()`) + `createdAt`/`updatedAt` (where applicable) + `deletedAt` soft delete.
- **No storage migration to SQLite.** Desktop keeps IndexedDB (spec 025); the bridge moves data webview↔Rust via Tauri IPC and lets Rust own the folder.
- **Docs rule (CLAUDE.md).** Any user-visible change is documented in `docs/guia/` in the SAME commit; update the index date in `docs/guia-de-uso.md`.
- **Plain-JS style.** No type annotations in hand-written code. Tauri Rust code is normal Rust.
- **Tests split by project (`vite.config.ts`):** node (`server`) for repo/logic tests with `fake-indexeddb`; jsdom for anything that calls `sanitizeHtml` (needs a DOM). New `bridge/**` tests run under jsdom.

---

## File Structure

**New — data & logic (pure JS, Vitest):**
- `src/lib/storage/activity.ts` — the `activity` table repository (append + queries). One responsibility: read/write bitácora rows.
- `src/lib/storage/agents.ts` — the single connected-agent identity (id + name), cloud-ready.
- `src/lib/tasks/actions.ts` — the task-action layer: the one place to create/edit/complete/reopen/read tasks; wraps block repos + appends activity.
- `src/lib/tasks/redo.ts` — pure helper: does a task's state + last activity mean "reopen/redo".
- `src/lib/tasks/index.ts` — barrel for the task-action layer.

**New — bridge (JS side):**
- `src/lib/bridge/export.ts` — build the agent export payload from agent-visible notes only (the privacy gate).
- `src/lib/bridge/ingest.ts` — take an agent change, sanitize it, gate it, and route it through the task-action layer (Phase 2).
- `src/lib/bridge/tauri.ts` — thin desktop-only IPC wrappers around the Rust commands.
- `src/lib/bridge/BridgeLifecycle.svelte` — desktop-only lifecycle: export on change (Phase 1); listen + ingest (Phase 2).
- `src/lib/bridge/index.ts` — barrel.

**New — bridge (Rust side):**
- `src-tauri/src/bridge.rs` — Rust commands: own the mailbox folder, write the export file (Phase 1); watch the inbox and emit change events (Phase 2).

**Modified:**
- `src/lib/storage/db.ts` — add migration v6 (activity table).
- `src/lib/storage/blocks.ts` — `createBlock` defaults `createdBy: 'user'`.
- `src/lib/storage/notes.ts` — `createNote` defaults `agentVisible: false`.
- `src/lib/storage/index.ts` — export the new repos.
- `src/lib/storage/db.migrations.test.ts` — add v6 guard.
- `src/lib/editor/Editor.svelte` — "Visible para agentes" toggle in the note-header title row.
- `src/lib/components/SettingsDialog.svelte` — read-only "Agentes" activity view + minimal redo affordance.
- `src/routes/+page.svelte` — mount `BridgeLifecycle` (desktop-only).
- `src-tauri/src/lib.rs` — register the bridge commands in `invoke_handler`.
- `src-tauri/Cargo.toml` — add `notify` (Phase 2).
- `vite.config.ts` — route `src/lib/bridge/**` tests to the jsdom project.
- `docs/guia/17-agentes.md` (new) + `docs/guia-de-uso.md` (index + date).

---

## Milestones

- **A — Data foundation** (Tasks 1–4): migration v6, activity + agents repos, new field defaults. Vitest only.
- **B — Task-action layer** (Tasks 5–8): create/complete/reopen/edit/read + redo helper. Vitest only.
- **C — Bridge gate (JS)** (Tasks 9–10): gated export payload + gated/sanitized ingest. Vitest only.
- **D — UI** (Tasks 11–13): header toggle, Agentes view, redo affordance. Playwright + Vitest.
- **E — Buzón bridge Phase 1** (Tasks 14–15): Rust owns folder + writes export; JS exports on change. Manual desktop verify.
- **F — Buzón bridge Phase 2** (Tasks 16–17): Rust watches inbox + emits; JS ingests. Manual desktop verify.

Milestones A–D are pure web/JS and fully shippable & testable on their own (they add the whole task-action + bitácora + visibility model and its UI without any desktop code). E–F add the desktop reach.

---

### Task 1: Migration v6 — the `activity` table

**Files:**
- Modify: `src/lib/storage/db.ts` (append after v5, ends line 81)
- Test: `src/lib/storage/db.migrations.test.ts` (add a v6 describe block)

**Interfaces:**
- Produces: Dexie `db` now declares version 6 with an `activity` table indexed `id, blockId, noteId, at`. No upgrade body — additive block/note fields (`createdBy`, `agentVisible`) are read with a default in the repositories, so existing rows need no rewrite.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/db.migrations.test.ts` (a new `describe` after the existing v1→v5 block; it uses the same `seedLegacyV1` / `migrate` helpers already in the file):

```js
describe('db migrations v1 → v6', () => {
	it('v6: opens on legacy data, keeps old rows, exposes an empty activity table', async () => {
		await seedLegacyV1({
			notes: [{ id: 'n1', title: 'vieja', updatedAt: '2026-01-01T00:00:00.000Z' }],
			blocks: [{ id: 'b1', noteId: 'n1', parentBlockId: null, content: 'tarea' }]
		});
		await migrate();

		// Old data survived the whole chain.
		expect((await db.table('notes').get('n1')).title).toBe('vieja');
		expect((await db.table('blocks').get('b1')).content).toBe('tarea');
		// The new table exists and starts empty.
		expect(db.tables.some((t) => t.name === 'activity')).toBe(true);
		expect(await db.table('activity').count()).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/storage/db.migrations.test.ts`
Expected: FAIL — `db.tables.some(... 'activity')` is `false` (table not declared yet).

- [ ] **Step 3: Add the migration**

Append to `src/lib/storage/db.ts` after the v5 block (line 81):

```js
// v6 (spec 028): agent beta. New `activity` table — the per-task bitácora and
// the 012 "Agent Action History" entity, arriving early for the agent↔user
// channel. No upgrade body: the additive block field `createdBy` and note field
// `agentVisible` are read with a default in the repositories, so existing rows
// need no rewrite, and the activity table simply starts empty.
db.version(6).stores({
	activity: 'id, blockId, noteId, at'
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/storage/db.migrations.test.ts`
Expected: PASS (both the v1→v5 and the new v1→v6 blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/db.migrations.test.ts
git commit -m "feat(storage): migración v6 con tabla activity (bitácora de agentes)"
```

---

### Task 2: `activity` repository

**Files:**
- Create: `src/lib/storage/activity.ts`
- Test: `src/lib/storage/activity.test.ts`
- Modify: `src/lib/storage/index.ts` (export the repo)

**Interfaces:**
- Consumes: `db` (Task 1), `createId`, `now` from `./ids`, `trackPendingWrite` from `./pending-writes`.
- Produces:
  - `appendActivity({ blockId, noteId, actor, action, text })` → resolves to the stored row `{ id, blockId, noteId, actor, action, text, at, deletedAt }`. `action` ∈ `'created' | 'done' | 'reopened' | 'note' | 'edited'`. `text` defaults `''`. `at` = `now()`. `deletedAt` = `null`.
  - `listActivityByBlock(blockId)` → live rows for that block, ascending by `at` (tiebreak `id`).
  - `listActivityByNote(noteId)` → live rows for that note, ascending by `at` (tiebreak `id`).
  - `listRecentActivity(limit = 50)` → all live rows, descending by `at` (tiebreak `id`), capped at `limit`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/activity.test.ts`:

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	appendActivity,
	listActivityByBlock,
	listActivityByNote,
	listRecentActivity
} from './activity';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('activity repository', () => {
	it('appends an entry with actor, action, at and defaults', async () => {
		const row = await appendActivity({
			blockId: 'b1',
			noteId: 'n1',
			actor: 'agent',
			action: 'done'
		});
		expect(row.blockId).toBe('b1');
		expect(row.actor).toBe('agent');
		expect(row.action).toBe('done');
		expect(row.text).toBe('');
		expect(typeof row.at).toBe('string');
		expect(row.deletedAt).toBe(null);
	});

	it('lists a block’s entries ascending by at', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'user', action: 'created', text: 'c' });

		const rows = await listActivityByBlock('b1');
		expect(rows.map((r) => r.text)).toEqual(['a', 'b']);
	});

	it('lists a note’s entries and recent activity newest first', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });

		expect((await listActivityByNote('n1')).length).toBe(2);
		const recent = await listRecentActivity(10);
		expect(recent[0].text).toBe('b');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/storage/activity.test.ts`
Expected: FAIL — cannot import from `./activity` (module missing).

- [ ] **Step 3: Write the repository**

Create `src/lib/storage/activity.ts`:

```js
import { db } from './db';
import { createId, now } from './ids';
import { trackPendingWrite } from './pending-writes';

const activity = db.table('activity');

// Chronological order. `at` is an ISO timestamp; when two entries land in the
// same millisecond we fall back to the (stable) id so the order is
// deterministic even if not strictly chronological.
function byAtAsc(a, b) {
	return a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at);
}

export function appendActivity({ blockId, noteId, actor, action, text = '' }) {
	return trackPendingWrite(async () => {
		const row = {
			id: createId(),
			blockId,
			noteId,
			actor,
			action,
			text,
			at: now(),
			deletedAt: null
		};
		await activity.add(row);
		return row;
	});
}

export async function listActivityByBlock(blockId) {
	const rows = await activity
		.where('blockId')
		.equals(blockId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(byAtAsc);
}

export async function listActivityByNote(noteId) {
	const rows = await activity
		.where('noteId')
		.equals(noteId)
		.filter((row) => !row.deletedAt)
		.toArray();
	return rows.sort(byAtAsc);
}

export async function listRecentActivity(limit = 50) {
	const rows = await activity.filter((row) => !row.deletedAt).toArray();
	return rows.sort((a, b) => byAtAsc(b, a)).slice(0, limit);
}
```

- [ ] **Step 4: Export from the storage barrel**

In `src/lib/storage/index.ts`, add after the blocks export block (after the `toggleTodoCascade` line, before the snippets export):

```js
export {
	appendActivity,
	listActivityByBlock,
	listActivityByNote,
	listRecentActivity
} from './activity';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/storage/activity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/activity.ts src/lib/storage/activity.test.ts src/lib/storage/index.ts
git commit -m "feat(storage): repositorio de la bitácora (activity)"
```

---

### Task 3: connected-agent identity repository

**Files:**
- Create: `src/lib/storage/agents.ts`
- Test: `src/lib/storage/agents.test.ts`
- Modify: `src/lib/storage/index.ts`

**Interfaces:**
- Consumes: `db`, `createId`, `now`, `trackPendingWrite`. Stored in the existing `settings` table under one key (no new Dexie table needed; a single agent is one row) but shaped as a full entity (id + name + timestamps + soft delete) so 029 can promote it to its own synced table without redesign.
- Produces:
  - `getConnectedAgent()` → the stored agent `{ id, name, createdAt, updatedAt, deletedAt }` or `undefined` when none / soft-deleted.
  - `setConnectedAgent({ name })` → upserts the single agent (mints `id` on first call, keeps it after), returns the row.
  - `AGENT_SETTING_KEY` (string constant `'connectedAgent'`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/agents.test.ts`:

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getConnectedAgent, setConnectedAgent } from './agents';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('connected agent', () => {
	it('is undefined until one is set', async () => {
		expect(await getConnectedAgent()).toBeUndefined();
	});

	it('mints a stable id on first set and keeps it', async () => {
		const first = await setConnectedAgent({ name: 'Claude local' });
		expect(first.id).toBeTruthy();
		expect(first.name).toBe('Claude local');

		const renamed = await setConnectedAgent({ name: 'Otro' });
		expect(renamed.id).toBe(first.id); // same identity, new display name
		expect((await getConnectedAgent()).name).toBe('Otro');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/storage/agents.test.ts`
Expected: FAIL — module `./agents` missing.

- [ ] **Step 3: Write the repository**

Create `src/lib/storage/agents.ts`:

```js
import { db } from './db';
import { createId, now } from './ids';
import { trackPendingWrite } from './pending-writes';

// v1 stores the single connected agent as one settings row. It is shaped as a
// full entity (stable id, timestamps, soft delete) so spec 029 can move it to
// its own synced table without a data reshape.
export const AGENT_SETTING_KEY = 'connectedAgent';

const settings = db.table('settings');

export async function getConnectedAgent() {
	const row = await settings.get(AGENT_SETTING_KEY);
	const agent = row?.value;
	if (!agent || agent.deletedAt) return undefined;
	return agent;
}

export function setConnectedAgent({ name }) {
	return trackPendingWrite(async () => {
		const existing = (await settings.get(AGENT_SETTING_KEY))?.value;
		const timestamp = now();
		const agent = {
			id: existing?.id ?? createId(),
			name,
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp,
			deletedAt: null
		};
		await settings.put({ key: AGENT_SETTING_KEY, value: agent, updatedAt: timestamp });
		return agent;
	});
}
```

- [ ] **Step 4: Export from the storage barrel**

In `src/lib/storage/index.ts`, add after the activity export added in Task 2:

```js
export { getConnectedAgent, setConnectedAgent, AGENT_SETTING_KEY } from './agents';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/storage/agents.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/agents.ts src/lib/storage/agents.test.ts src/lib/storage/index.ts
git commit -m "feat(storage): identidad del agente conectado (v1, single agent)"
```

---

### Task 4: additive field defaults — `createdBy` (block) and `agentVisible` (note)

**Files:**
- Modify: `src/lib/storage/blocks.ts:9-49` (`createBlock`)
- Modify: `src/lib/storage/notes.ts:9-25` (`createNote`)
- Test: `src/lib/storage/blocks.test.ts` (add a case), `src/lib/storage/notes.test.ts` (add a case)

**Interfaces:**
- Produces: every new block carries `createdBy` (defaults `'user'`, or the passed value); every new note carries `agentVisible: false`. `updateNote(id, { agentVisible })` already flows through the generic updater (no change needed there).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/blocks.test.ts` inside `describe('blocks repository', ...)`:

```js
it('records createdBy, defaulting to user', async () => {
	const note = await createNote();
	const mine = await createBlock({ noteId: note.id, content: 'x' });
	const agents = await createBlock({ noteId: note.id, content: 'y', createdBy: 'agent' });
	expect(mine.createdBy).toBe('user');
	expect(agents.createdBy).toBe('agent');
});
```

Add to `src/lib/storage/notes.test.ts` inside its main describe (mirror the file's existing import of `createNote`):

```js
it('creates notes hidden from agents by default', async () => {
	const note = await createNote();
	expect(note.agentVisible).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- --run src/lib/storage/blocks.test.ts src/lib/storage/notes.test.ts`
Expected: FAIL — `createdBy` is `undefined`; `agentVisible` is `undefined`.

- [ ] **Step 3: Add the defaults**

In `src/lib/storage/blocks.ts`, add `createdBy` to the destructured defaults (after `dueDate = null` on line 21) and to the stored object (after `dueDate,` on line 41):

```js
			dueDate = null,
			createdBy = 'user'
```

```js
			dueDate,
			createdBy,
```

In `src/lib/storage/notes.ts`, add `agentVisible: false` to the note object in `createNote` (after `folderId: null,` on line 17):

```js
			folderId: null,
			agentVisible: false,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/storage/blocks.test.ts src/lib/storage/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/blocks.ts src/lib/storage/notes.ts src/lib/storage/blocks.test.ts src/lib/storage/notes.test.ts
git commit -m "feat(storage): campos createdBy (bloque) y agentVisible (nota)"
```

---

### Task 5: task-action layer — `createTask`

**Files:**
- Create: `src/lib/tasks/actions.ts`
- Create: `src/lib/tasks/index.ts`
- Test: `src/lib/tasks/actions.test.ts`

**Interfaces:**
- Consumes: `createBlock`, `updateBlock`, `getBlock`, `listBlocksByNote` from `$lib/storage`; `appendActivity`, `listActivityByBlock` from `$lib/storage`; `plainTextToHtml` from `$lib/format`.
- Produces:
  - `createTask({ noteId, parentBlockId = null, content = '', html, actor = 'user' })` → `{ block, activity }`. Creates a `todo` block with `createdBy: actor`, appends one `created` activity entry (`text` = the task content). `content`/`html` are assumed already clean — the bridge sanitizes agent input BEFORE calling this layer (Task 10).

- [ ] **Step 1: Write the failing test**

Create `src/lib/tasks/actions.test.ts`:

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, getBlock, listActivityByBlock } from '$lib/storage';
import { createTask } from './actions';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('createTask', () => {
	it('creates a todo block and one created activity entry', async () => {
		const note = await createNote();
		const { block, activity } = await createTask({
			noteId: note.id,
			content: 'Revisar el brief',
			actor: 'agent'
		});

		expect(block.type).toBe('todo');
		expect(block.checked).toBe(false);
		expect(block.createdBy).toBe('agent');
		expect((await getBlock(block.id)).content).toBe('Revisar el brief');

		expect(activity.action).toBe('created');
		expect(activity.actor).toBe('agent');
		const log = await listActivityByBlock(block.id);
		expect(log.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: FAIL — `./actions` missing.

- [ ] **Step 3: Write `createTask` + the barrel**

Create `src/lib/tasks/actions.ts`:

```js
// The single place to create, edit, complete, reopen, and read TASKS (todo
// blocks). Both the app UI and the agent bridge call this layer; it wraps the
// block repositories and appends the matching activity (bitácora) entry, so
// there is never a second, divergent write path. It assumes its text/html
// inputs are already clean — the bridge runs untrusted agent input through the
// ingest gate BEFORE calling here (see src/lib/bridge/ingest.ts).

import {
	createBlock,
	updateBlock,
	getBlock,
	listBlocksByNote,
	appendActivity,
	listActivityByBlock
} from '$lib/storage';
import { plainTextToHtml } from '$lib/format';

export async function createTask({ noteId, parentBlockId = null, content = '', html, actor = 'user' }) {
	const block = await createBlock({
		noteId,
		parentBlockId,
		type: 'todo',
		content,
		html: html ?? plainTextToHtml(content),
		createdBy: actor
	});
	const activity = await appendActivity({
		blockId: block.id,
		noteId,
		actor,
		action: 'created',
		text: content
	});
	return { block, activity };
}
```

Create `src/lib/tasks/index.ts`:

```js
export { createTask } from './actions';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/actions.ts src/lib/tasks/index.ts src/lib/tasks/actions.test.ts
git commit -m "feat(tasks): capa de acciones — createTask + entrada de bitácora"
```

---

### Task 6: task-action layer — `completeTask`

**Files:**
- Modify: `src/lib/tasks/actions.ts`, `src/lib/tasks/index.ts`
- Test: `src/lib/tasks/actions.test.ts` (add a describe)

**Interfaces:**
- Produces: `completeTask({ blockId, actor, text = '' })` → `{ block, activity }`. Sets the block's `checked = true` (direct set on that task — the agent acts on one task, no cascade), appends one `done` entry with `actor` + timestamp and an optional one-line `summary` in `text`. Returns the updated block and the activity row.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tasks/actions.test.ts` (add `completeTask` to the import from `./actions`):

```js
describe('completeTask', () => {
	it('checks the task and appends a done entry with actor and summary', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });

		const { block: done, activity } = await completeTask({
			blockId: block.id,
			actor: 'agent',
			text: 'Listo: enlace agregado'
		});

		expect(done.checked).toBe(true);
		expect(activity.action).toBe('done');
		expect(activity.actor).toBe('agent');
		expect(activity.text).toBe('Listo: enlace agregado');

		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: FAIL — `completeTask` is not exported.

- [ ] **Step 3: Add `completeTask`**

Append to `src/lib/tasks/actions.ts`:

```js
export async function completeTask({ blockId, actor, text = '' }) {
	const block = await updateBlock(blockId, { checked: true });
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'done',
		text
	});
	return { block, activity };
}
```

Add to `src/lib/tasks/index.ts`:

```js
export { createTask, completeTask } from './actions';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/actions.ts src/lib/tasks/index.ts src/lib/tasks/actions.test.ts
git commit -m "feat(tasks): completeTask marca checked + deja traza done"
```

---

### Task 7: task-action layer — `reopenTask`, `addTaskNote`, `editTask`

**Files:**
- Modify: `src/lib/tasks/actions.ts`, `src/lib/tasks/index.ts`
- Test: `src/lib/tasks/actions.test.ts`

**Interfaces:**
- Produces:
  - `reopenTask({ blockId, actor = 'user', text = '' })` → `{ block, activity }`. Sets `checked = false`, appends a `reopened` entry.
  - `addTaskNote({ blockId, actor = 'user', text })` → `{ activity }`. Appends a `note` entry carrying the user's instruction (e.g. "Rehacer: …"). Does NOT change the block. `text` is stored as a plain string and rendered escaped by Svelte — it is never written into `block.html`, so it is not an XSS sink.
  - `editTask({ blockId, content, html, actor = 'user' })` → `{ block, activity }`. Updates the block's `content`/`html`, appends an `edited` entry.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tasks/actions.test.ts` (add the three to the import):

```js
describe('reopen / note / edit', () => {
	it('reopen unchecks and traces; addTaskNote records an instruction', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });

		const { block: reopened } = await reopenTask({ blockId: block.id, actor: 'user' });
		expect(reopened.checked).toBe(false);

		await addTaskNote({ blockId: block.id, actor: 'user', text: 'Rehacer: agregá fuentes' });

		const log = await listActivityByBlock(block.id);
		expect(log.map((e) => e.action)).toEqual(['created', 'done', 'reopened', 'note']);
		expect(log.at(-1).text).toBe('Rehacer: agregá fuentes');
	});

	it('editTask updates content and traces edited', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'viejo', actor: 'user' });
		const { block: edited, activity } = await editTask({
			blockId: block.id,
			content: 'nuevo',
			actor: 'agent'
		});
		expect(edited.content).toBe('nuevo');
		expect(activity.action).toBe('edited');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Add the functions**

Append to `src/lib/tasks/actions.ts`:

```js
export async function reopenTask({ blockId, actor = 'user', text = '' }) {
	const block = await updateBlock(blockId, { checked: false });
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'reopened',
		text
	});
	return { block, activity };
}

// The user's redo channel: an instruction line the agent can read. Stored as
// plain text on the activity row (never in block.html), rendered escaped.
export async function addTaskNote({ blockId, actor = 'user', text }) {
	const block = await getBlock(blockId);
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'note',
		text
	});
	return { activity };
}

export async function editTask({ blockId, content, html, actor = 'user' }) {
	const changes = { content };
	if (html !== undefined) changes.html = html;
	else changes.html = plainTextToHtml(content);
	const block = await updateBlock(blockId, changes);
	const activity = await appendActivity({
		blockId,
		noteId: block.noteId,
		actor,
		action: 'edited',
		text: content
	});
	return { block, activity };
}
```

Replace `src/lib/tasks/index.ts` contents with:

```js
export { createTask, completeTask, reopenTask, addTaskNote, editTask } from './actions';
export { isRedoRequested } from './redo';
```

(Note: `isRedoRequested` arrives in Task 8; adding it now keeps the barrel stable. If executing tasks strictly in isolation, add that line in Task 8 instead.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/actions.ts src/lib/tasks/index.ts src/lib/tasks/actions.test.ts
git commit -m "feat(tasks): reopenTask, addTaskNote (canal de rehacer) y editTask"
```

---

### Task 8: redo helper + `readTask` / `listTasks`

**Files:**
- Create: `src/lib/tasks/redo.ts`
- Modify: `src/lib/tasks/actions.ts`, `src/lib/tasks/index.ts`
- Test: `src/lib/tasks/redo.test.ts`, `src/lib/tasks/actions.test.ts`

**Interfaces:**
- Produces:
  - `isRedoRequested(block, activity)` (pure, in `redo.ts`) → `true` when `!block.checked` AND `activity.length > 0` AND the last entry is a user `note`. This is the rule the agent follows: unchecked + last activity is a user instruction ⇒ reopen/redo; checked ⇒ done, leave alone.
  - `readTask(blockId)` (in `actions.ts`) → `{ block, activity }` (the block plus its ordered bitácora), or `undefined` if the block is gone.
  - `listTasks(noteId)` → the note's live `todo` blocks (array), ordered as stored.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tasks/redo.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { isRedoRequested } from './redo';

const note = (actor) => ({ actor, action: 'note' });

describe('isRedoRequested', () => {
	it('true when unchecked and last activity is a user instruction', () => {
		expect(isRedoRequested({ checked: false }, [{ action: 'done', actor: 'agent' }, note('user')])).toBe(true);
	});
	it('false when the task is checked (done, leave alone)', () => {
		expect(isRedoRequested({ checked: true }, [note('user')])).toBe(false);
	});
	it('false when there is no activity', () => {
		expect(isRedoRequested({ checked: false }, [])).toBe(false);
	});
	it('false when the last entry is not a user note', () => {
		expect(isRedoRequested({ checked: false }, [{ action: 'reopened', actor: 'user' }])).toBe(false);
	});
});
```

Add to `src/lib/tasks/actions.test.ts` (add `readTask`, `listTasks` to the import):

```js
describe('readTask / listTasks', () => {
	it('readTask returns the block and its ordered bitácora', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'T', actor: 'user' });
		await completeTask({ blockId: block.id, actor: 'agent' });
		const read = await readTask(block.id);
		expect(read.block.id).toBe(block.id);
		expect(read.activity.map((e) => e.action)).toEqual(['created', 'done']);
	});

	it('listTasks returns only todo blocks of the note', async () => {
		const note = await createNote();
		await createTask({ noteId: note.id, content: 'una', actor: 'user' });
		const tasks = await listTasks(note.id);
		expect(tasks.length).toBe(1);
		expect(tasks[0].type).toBe('todo');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit -- --run src/lib/tasks/redo.test.ts src/lib/tasks/actions.test.ts`
Expected: FAIL — `redo.ts` missing; `readTask`/`listTasks` not exported.

- [ ] **Step 3: Write `redo.ts` and the readers**

Create `src/lib/tasks/redo.ts`:

```js
// The rule the connecting agent follows to decide whether a task needs redoing:
// unchecked + the last bitácora entry is a user instruction ("note") means the
// user rejected the result and wants it redone; a checked task is done and must
// be left alone (unless the user unchecks it again).
export function isRedoRequested(block, activity) {
	if (block.checked) return false;
	const last = activity.at(-1);
	return Boolean(last) && last.actor === 'user' && last.action === 'note';
}
```

Append to `src/lib/tasks/actions.ts` (add `listActivityByBlock` is already imported; add nothing new to imports):

```js
export async function readTask(blockId) {
	const block = await getBlock(blockId);
	if (!block) return undefined;
	const activity = await listActivityByBlock(blockId);
	return { block, activity };
}

export async function listTasks(noteId) {
	const blocks = await listBlocksByNote(noteId);
	return blocks.filter((block) => block.type === 'todo');
}
```

Ensure `src/lib/tasks/index.ts` reads:

```js
export {
	createTask,
	completeTask,
	reopenTask,
	addTaskNote,
	editTask,
	readTask,
	listTasks
} from './actions';
export { isRedoRequested } from './redo';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit -- --run src/lib/tasks/redo.test.ts src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/redo.ts src/lib/tasks/actions.ts src/lib/tasks/index.ts src/lib/tasks/redo.test.ts src/lib/tasks/actions.test.ts
git commit -m "feat(tasks): regla de rehacer + lectores readTask/listTasks"
```

---

### Task 9: bridge export — the agent-visibility gate (privacy-critical)

**Files:**
- Create: `src/lib/bridge/export.ts`
- Create: `src/lib/bridge/index.ts`
- Test: `src/lib/bridge/export.test.ts`
- Modify: `vite.config.ts` (route `src/lib/bridge/**` tests to jsdom)

**Interfaces:**
- Consumes: `listNotes`, `listBlocksByNote`, `listActivityByBlock` from `$lib/storage`; `listTasks` from `$lib/tasks`.
- Produces:
  - `toAgentPayload(notes, blocksByNote, activityByBlock)` (pure) → `{ format: 'copynotes.agent', version: 1, notes: [ { id, title, tasks: [ { id, content, html, checked, createdBy, activity } ] } ] }`. Includes ONLY notes whose `agentVisible === true`.
  - `buildAgentExport()` (async) → the same payload, gathered from storage, with `exportedAt` added.

- [ ] **Step 1: Route bridge tests to jsdom**

In `vite.config.ts`, the jsdom project's `include` array (around line 62) add `'src/lib/bridge/**/*.{test,spec}.{js,ts}',` and in the `server` project's `exclude` array (around line 77) add the same string. Bridge ingest (Task 10) calls `sanitizeHtml`, which needs a DOM.

- [ ] **Step 2: Write the failing test**

Create `src/lib/bridge/export.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { toAgentPayload } from './export';

describe('toAgentPayload (agent-visibility gate)', () => {
	it('includes only agentVisible notes, excluding hidden ones', () => {
		const notes = [
			{ id: 'n1', title: 'Visible', agentVisible: true },
			{ id: 'n2', title: 'Privada', agentVisible: false }
		];
		const blocksByNote = {
			n1: [{ id: 'b1', type: 'todo', content: 'hacer', html: 'hacer', checked: false, createdBy: 'user' }],
			n2: [{ id: 'b2', type: 'todo', content: 'secreto', html: 'secreto', checked: false, createdBy: 'user' }]
		};
		const activityByBlock = { b1: [], b2: [] };

		const payload = toAgentPayload(notes, blocksByNote, activityByBlock);

		expect(payload.notes.map((n) => n.id)).toEqual(['n1']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('exposes only todo blocks as tasks', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true }];
		const blocksByNote = {
			n1: [
				{ id: 'b1', type: 'todo', content: 't', html: 't', checked: true, createdBy: 'agent' },
				{ id: 'b2', type: 'text', content: 'prosa', html: 'prosa', checked: false, createdBy: 'user' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { b1: [], b2: [] });
		expect(payload.notes[0].tasks.map((t) => t.id)).toEqual(['b1']);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/export.test.ts`
Expected: FAIL — `./export` missing.

- [ ] **Step 4: Write the export builder + barrel**

Create `src/lib/bridge/export.ts`:

```js
// The export boundary is the privacy gate: notes whose agentVisible is not true
// MUST NOT leave the app through the bridge. The agent sees TASKS only (todo
// blocks) and their bitácora — never a note's prose body.

import { listNotes, listBlocksByNote, listActivityByBlock } from '$lib/storage';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 1;

function taskFromBlock(block, activity) {
	return {
		id: block.id,
		content: block.content,
		html: block.html,
		checked: block.checked,
		createdBy: block.createdBy ?? 'user',
		activity: activity ?? []
	};
}

export function toAgentPayload(notes, blocksByNote, activityByBlock) {
	const visible = notes.filter((note) => note.agentVisible === true);
	return {
		format: AGENT_EXPORT_FORMAT,
		version: AGENT_EXPORT_VERSION,
		notes: visible.map((note) => ({
			id: note.id,
			title: note.title,
			tasks: (blocksByNote[note.id] ?? [])
				.filter((block) => block.type === 'todo')
				.map((block) => taskFromBlock(block, activityByBlock[block.id]))
		}))
	};
}

export async function buildAgentExport() {
	const notes = (await listNotes()).filter((note) => note.agentVisible === true);
	const blocksByNote = {};
	const activityByBlock = {};
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		for (const block of blocks) {
			if (block.type === 'todo') activityByBlock[block.id] = await listActivityByBlock(block.id);
		}
	}
	return { ...toAgentPayload(notes, blocksByNote, activityByBlock), exportedAt: new Date().toISOString() };
}
```

Create `src/lib/bridge/index.ts`:

```js
export { buildAgentExport, toAgentPayload, AGENT_EXPORT_FORMAT, AGENT_EXPORT_VERSION } from './export';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/bridge/export.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bridge/export.ts src/lib/bridge/index.ts src/lib/bridge/export.test.ts vite.config.ts
git commit -m "feat(bridge): export con compuerta de visibilidad para agentes"
```

---

### Task 10: bridge ingest — sanitize + gate agent changes into the task-action layer

**Files:**
- Create: `src/lib/bridge/ingest.ts`
- Modify: `src/lib/bridge/index.ts`
- Test: `src/lib/bridge/ingest.test.ts` (jsdom — calls `sanitizeHtml`)

**Interfaces:**
- Consumes: `sanitizeHtml`, `htmlToPlainText` from `$lib/format`; `getNote` from `$lib/storage`; `createTask`, `completeTask`, `addTaskNote` from `$lib/tasks`.
- Produces:
  - `ingestAgentChange(change)` (async) → `{ ok, reason?, result? }`. `change` = `{ type, noteId, blockId?, content?, text?, agentId }`, `type` ∈ `'createTask' | 'completeTask' | 'addNote'`. Rules:
    - The target note must exist AND be `agentVisible` — else `{ ok: false, reason: 'not-agent-visible' }` (the gate again on the way IN).
    - Unknown/forbidden `type` (delete/export/reorder/anything else) → `{ ok: false, reason: 'not-allowed' }`.
    - `content` (task text) is sanitized to plain text via `htmlToPlainText(sanitizeHtml(raw))` before it reaches `block.html`; `text` (bitácora) is sanitized to plain text the same way (it is stored as a plain string, never as html).

- [ ] **Step 1: Write the failing test**

Create `src/lib/bridge/ingest.test.ts`:

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, updateNote, getBlock, listActivityByBlock } from '$lib/storage';
import { listTasks } from '$lib/tasks';
import { ingestAgentChange } from './ingest';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('ingestAgentChange (untrusted agent input)', () => {
	it('rejects a change targeting a non-agent-visible note', async () => {
		const note = await createNote(); // agentVisible defaults to false
		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'x',
			agentId: 'agent'
		});
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-agent-visible');
		expect(await listTasks(note.id)).toHaveLength(0);
	});

	it('creates a task on a visible note and strips smuggled markup', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });

		const res = await ingestAgentChange({
			type: 'createTask',
			noteId: note.id,
			content: 'Hola <img src=x onerror=alert(1)> mundo',
			agentId: 'agent'
		});
		expect(res.ok).toBe(true);

		const tasks = await listTasks(note.id);
		expect(tasks).toHaveLength(1);
		// The dangerous attribute/markup is gone; visible text survives.
		expect(tasks[0].html).not.toContain('onerror');
		expect(tasks[0].content).toContain('Hola');
		expect(tasks[0].content).toContain('mundo');
	});

	it('rejects a forbidden action type', async () => {
		const note = await createNote();
		await updateNote(note.id, { agentVisible: true });
		const res = await ingestAgentChange({ type: 'deleteTask', noteId: note.id, agentId: 'agent' });
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not-allowed');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: FAIL — `./ingest` missing.

- [ ] **Step 3: Write the ingest pipeline**

Create `src/lib/bridge/ingest.ts`:

```js
// The ingest boundary treats agent input like paste/backup: untrusted. Every
// agent-written field is sanitized here BEFORE it reaches the task-action layer,
// and the target note must still be agentVisible (the gate on the way in, not
// only on the way out). The agent may only create tasks, complete tasks, or add
// a bitácora note — never delete, export, or reorder.

import { sanitizeHtml, htmlToPlainText } from '$lib/format';
import { getNote } from '$lib/storage';
import { createTask, completeTask, addTaskNote } from '$lib/tasks';

// Reduce any agent-supplied string to safe plain text: sanitize the markup,
// then flatten to text so it can never act as an html sink.
function toCleanText(raw) {
	return htmlToPlainText(sanitizeHtml(typeof raw === 'string' ? raw : ''));
}

const HANDLERS = {
	async createTask(change) {
		const content = toCleanText(change.content);
		return createTask({ noteId: change.noteId, content, actor: change.agentId });
	},
	async completeTask(change) {
		return completeTask({ blockId: change.blockId, actor: change.agentId, text: toCleanText(change.text) });
	},
	async addNote(change) {
		return addTaskNote({ blockId: change.blockId, actor: change.agentId, text: toCleanText(change.text) });
	}
};

export async function ingestAgentChange(change) {
	const handler = HANDLERS[change?.type];
	if (!handler) return { ok: false, reason: 'not-allowed' };

	const note = await getNote(change.noteId);
	if (!note || note.agentVisible !== true) return { ok: false, reason: 'not-agent-visible' };

	const result = await handler(change);
	return { ok: true, result };
}
```

Add to `src/lib/bridge/index.ts`:

```js
export { ingestAgentChange } from './ingest';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite check**

Run: `pnpm test`
Expected: PASS — all node + jsdom projects green, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bridge/ingest.ts src/lib/bridge/index.ts src/lib/bridge/ingest.test.ts
git commit -m "feat(bridge): ingest de agentes — sanitiza, gatea y usa la capa de tareas"
```

---

### Task 11: UI — "Visible para agentes" toggle in the note header

**Files:**
- Modify: `src/lib/editor/Editor.svelte` (title row, lines 1591–1628; script imports near line 20)
- Test: `e2e/agent-visibility.spec.ts` (new Playwright spec)
- Docs: `docs/guia/17-agentes.md` (new), `docs/guia-de-uso.md` (index + date)

**Interfaces:**
- Consumes: `updateNote` (already imported in Editor.svelte, line 20), `note` state (line 92), `onNoteUpdated` (line 85). Adds a `Bot` icon from `@lucide/svelte`.
- Produces: a toggle button next to the tag button that flips `note.agentVisible` via `updateNote(note.id, { agentVisible })` and notifies the parent through `onNoteUpdated(note.id, { agentVisible })`.

- [ ] **Step 1: Write the failing Playwright test**

Create `e2e/agent-visibility.spec.ts`. Match the existing e2e conventions (see `e2e/` for the app-boot helper; use the same one your suite already uses to open a fresh note):

```js
import { test, expect } from '@playwright/test';

test('note header exposes an agent-visibility toggle that persists', async ({ page }) => {
	await page.goto('/');
	// Create a note (adjust selector to your suite's helper if one exists).
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const toggle = page.getByRole('button', { name: 'Visible para agentes' });
	await expect(toggle).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	// Survives a reload (persisted through updateNote).
	await page.reload();
	await expect(page.getByRole('button', { name: 'Visible para agentes' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:e2e -- agent-visibility`
Expected: FAIL — no button named "Visible para agentes".

- [ ] **Step 3: Add the toggle**

In `src/lib/editor/Editor.svelte`, add `Bot` to the `@lucide/svelte` import (find the existing `import { ... } from '@lucide/svelte'` line and add `Bot`). Add a handler in the script (near the tag handlers, e.g. after `handleTitleInput`):

```js
	async function toggleAgentVisible() {
		const next = !note.agentVisible;
		note.agentVisible = next;
		await updateNote(note.id, { agentVisible: next });
		onNoteUpdated(note.id, { agentVisible: next });
	}
```

In the title-row markup, add a button before the tag button's wrapping `<div class="relative shrink-0">` (line 1603) so the two controls sit together:

```svelte
			<button
				type="button"
				onclick={toggleAgentVisible}
				aria-label="Visible para agentes"
				aria-pressed={note.agentVisible === true}
				use:tooltip={note.agentVisible
					? 'Los agentes pueden ver las tareas de esta nota'
					: 'Los agentes no ven esta nota'}
				class="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-[color,opacity] duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {note.agentVisible
					? 'text-primary opacity-100'
					: 'text-faint hover:text-foreground opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100'}"
			>
				<Bot size={18} aria-hidden="true" />
			</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:e2e -- agent-visibility`
Expected: PASS.

- [ ] **Step 5: Document the feature (same commit)**

Create `docs/guia/17-agentes.md` in plain Spanish:

```markdown
# Agentes (beta)

CopyNotes puede dejar que un **agente** (un asistente de IA que corre en tu
computadora) te ayude con las **tareas** de una nota. Es opcional y arranca
apagado: el agente no ve nada hasta que vos abrís la puerta.

## Hacer una nota visible para agentes

En el encabezado de la nota, al lado del botón de etiquetar, hay un botón con un
robot 🤖 **"Visible para agentes"**. Si lo activás, el agente puede leer las
**tareas** de esa nota (los renglones tipo tarea) y su historial. **Nunca** ve
el resto del texto de la nota, y ninguna nota sin este botón activado sale de la
app.

## Qué puede hacer el agente

- Leer las tareas de las notas que marcaste como visibles.
- Crear tareas y marcarlas como hechas, dejando siempre una línea en la
  **bitácora** (quién hizo qué y cuándo).

No puede borrar, exportar ni reordenar, y no escribe en el texto de tus notas.

## Si algo quedó mal: pedir que lo rehaga

Si el agente marcó una tarea como hecha pero no te gustó el resultado,
**destildá** la tarea y dejale una instrucción ("Rehacer: …"). El agente lee esa
instrucción como un pedido de rehacer.

## Ver la actividad

En **Configuración** (engranaje ⚙️) hay una sección **Agentes** con la lista de
lo último que hizo el agente.

## Solo en la app de escritorio

Esta conexión funciona en la app de escritorio (Mac). En el navegador todavía no.
```

In `docs/guia-de-uso.md`: add to the "## Temas" list `17. [Agentes](guia/17-agentes.md) — hacer una nota visible para agentes, bitácora, pedir rehacer (beta, escritorio)`, and update the "Última actualización" date line to `2026-07-23` with a one-line note about the agents beta.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/Editor.svelte e2e/agent-visibility.spec.ts docs/guia/17-agentes.md docs/guia-de-uso.md
git commit -m "feat(ui): botón 'Visible para agentes' en el encabezado de la nota"
```

---

### Task 12: UI — Settings > Agentes read-only activity view

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte`
- Test: `e2e/agent-activity.spec.ts` (new)

**Interfaces:**
- Consumes: `listRecentActivity` from `$lib/storage`. The dialog loads recent activity when it opens.
- Produces: an "Agentes" section below "Tamaño de texto" listing recent activity lines (actor · action · time · text), or an empty-state line when there is none. Read-only.

- [ ] **Step 1: Write the failing Playwright test**

Create `e2e/agent-activity.spec.ts`:

```js
import { test, expect } from '@playwright/test';

test('Settings shows an Agentes section', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Configuración' }).click();
	await expect(page.getByRole('heading', { name: 'Agentes' })).toBeVisible();
	// With no activity yet, the empty-state copy shows.
	await expect(page.getByText('Todavía no hay actividad de agentes.')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:e2e -- agent-activity`
Expected: FAIL — no "Agentes" heading.

- [ ] **Step 3: Add the Agentes section**

In `src/lib/components/SettingsDialog.svelte` `<script>`, import the reader and load on open:

```js
	import { listRecentActivity } from '$lib/storage';

	let activity = $state([]);

	// Load the recent bitácora each time the dialog opens (read-only view).
	$effect(() => {
		if (open) listRecentActivity(20).then((rows) => (activity = rows));
	});

	const ACTION_LABEL = {
		created: 'creó una tarea',
		done: 'marcó hecha',
		reopened: 'reabrió',
		note: 'dejó una nota',
		edited: 'editó'
	};

	function actorLabel(actor) {
		return actor === 'user' ? 'Vos' : 'Agente';
	}

	function timeLabel(at) {
		return new Date(at).toLocaleString('es');
	}
```

In the markup, add a new `<section>` after the "Tamaño de texto" section's closing `</section>` (line 96), still inside the `<div class="flex flex-col gap-5 ...">`:

```svelte
			<section class="flex flex-col gap-3">
				<div class="flex flex-col gap-0.5">
					<h3 class="text-sm font-bold">Agentes</h3>
					<p class="text-muted-foreground text-sm">Lo último que hicieron los agentes en tus tareas.</p>
				</div>

				{#if activity.length === 0}
					<p class="text-muted-foreground text-sm">Todavía no hay actividad de agentes.</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each activity as entry (entry.id)}
							<li class="border-border flex flex-col gap-0.5 rounded-md border px-3 py-2 text-sm">
								<span>
									<span class="font-medium">{actorLabel(entry.actor)}</span>
									{ACTION_LABEL[entry.action] ?? entry.action}
								</span>
								{#if entry.text}
									<span class="text-muted-foreground">{entry.text}</span>
								{/if}
								<span class="text-faint text-xs">{timeLabel(entry.at)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:e2e -- agent-activity`
Expected: PASS.

- [ ] **Step 5: Update the guide**

In `docs/guia/16-configuracion.md`, add a short paragraph noting the new **Agentes** section (read-only list of recent agent activity). Bump the index date in `docs/guia-de-uso.md` if not already 2026-07-23.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte e2e/agent-activity.spec.ts docs/guia/16-configuracion.md docs/guia-de-uso.md
git commit -m "feat(ui): sección Agentes (bitácora reciente) en Configuración"
```

---

### Task 13: UI — minimal redo affordance (uncheck + instruction)

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte`
- Test: `e2e/agent-redo.spec.ts` (new)

> **Decision flag for Hernan:** spec 028 "What Enters" lists only the header toggle and the read-only Agentes view; the redo *UI* is implied by User Flow step 6 but not listed. This task adds the smallest possible affordance so the flow is usable end-to-end. It can be deferred without breaking the data model (the task-action layer already supports `reopenTask` + `addTaskNote`, tested in Task 7).

**Interfaces:**
- Consumes: `reopenTask`, `addTaskNote` from `$lib/tasks`; the `activity` list already loaded in Task 12.
- Produces: on each `done` entry whose actor is an agent, a "Rehacer" control that unchecks the task and records the typed instruction as a `note` entry, then refreshes the list.

- [ ] **Step 1: Write the failing test**

Create `e2e/agent-redo.spec.ts`. This needs a task the "agent" completed; seed it through the app by evaluating the bridge ingest in the page context, or reuse a suite helper if one exists. Minimal version that drives the UI once an agent-done entry exists:

```js
import { test, expect } from '@playwright/test';

test('a redo instruction unchecks the task and records a note', async ({ page }) => {
	await page.goto('/');

	// Seed: a visible note with an agent-completed task, via the app's own layer.
	await page.evaluate(async () => {
		const storage = await import('/src/lib/storage/index.ts');
		const tasks = await import('/src/lib/tasks/index.ts');
		const note = await storage.createNote();
		await storage.updateNote(note.id, { agentVisible: true });
		const { block } = await tasks.createTask({ noteId: note.id, content: 'Tarea', actor: 'user' });
		await tasks.completeTask({ blockId: block.id, actor: 'agent', text: 'hecho' });
	});

	await page.getByRole('button', { name: 'Configuración' }).click();
	await page.getByRole('button', { name: 'Rehacer' }).first().click();
	await page.getByLabel('Instrucción para rehacer').fill('Rehacer: agregá fuentes');
	await page.getByRole('button', { name: 'Enviar' }).click();

	await expect(page.getByText('Rehacer: agregá fuentes')).toBeVisible();
});
```

(If your e2e harness cannot `import()` app modules in `page.evaluate`, seed instead through the existing UI: create a note, mark it visible, add a todo, then complete it via the bridge ingest exposed on `window` in dev — or adapt to your suite's seeding helper. Keep the assertion: the redo note appears.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:e2e -- agent-redo`
Expected: FAIL — no "Rehacer" control.

- [ ] **Step 3: Add the redo affordance**

In `src/lib/components/SettingsDialog.svelte` `<script>`, add:

```js
	import { reopenTask, addTaskNote } from '$lib/tasks';

	let redoFor = $state(null); // blockId currently being redone
	let redoText = $state('');

	async function submitRedo(entry) {
		const text = redoText.trim();
		if (!text) return;
		await reopenTask({ blockId: entry.blockId, actor: 'user' });
		await addTaskNote({ blockId: entry.blockId, actor: 'user', text });
		redoFor = null;
		redoText = '';
		activity = await listRecentActivity(20);
	}
```

In the `{#each activity as entry}` list item (Task 12), after the time line, add:

```svelte
								{#if entry.action === 'done' && entry.actor !== 'user'}
									{#if redoFor === entry.blockId}
										<div class="mt-1 flex items-center gap-2">
											<input
												bind:value={redoText}
												aria-label="Instrucción para rehacer"
												placeholder="Rehacer: …"
												class="border-border min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
											/>
											<button
												type="button"
												onclick={() => submitRedo(entry)}
												class="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-bold"
											>
												Enviar
											</button>
										</div>
									{:else}
										<button
											type="button"
											onclick={() => { redoFor = entry.blockId; redoText = ''; }}
											class="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
										>
											Rehacer
										</button>
									{/if}
								{/if}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:e2e -- agent-redo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte e2e/agent-redo.spec.ts
git commit -m "feat(ui): pedir 'Rehacer' desde Configuración (destilda + instrucción)"
```

---

### Task 14: Buzón bridge Phase 1 (Rust) — own the folder, write the export

**Files:**
- Create: `src-tauri/src/bridge.rs`
- Modify: `src-tauri/src/lib.rs` (register commands, declare the module)

> **Verification note:** Rust has no Vitest layer. Verify by building and running the desktop app (`pnpm tauri dev`) and confirming the file lands in the mailbox folder. Keep the JS↔Rust contract (command names, args) exactly as written so Task 15 lines up.

**Interfaces:**
- Produces two Tauri commands (callable from JS via `invoke`):
  - `bridge_mailbox_path() -> Result<String, String>` — ensures `<app_data_dir>/mailbox/` (and `mailbox/inbox/`) exist and returns the mailbox path as a string (so the UI can tell the user where to point the agent).
  - `bridge_write_export(contents: String) -> Result<String, String>` — writes `contents` to `<app_data_dir>/mailbox/export.json` (atomically: temp file + rename) and returns the file path.

- [ ] **Step 1: Write the Rust module**

Create `src-tauri/src/bridge.rs`:

```rust
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// The Rust side owns the mailbox folder under the app's data dir. The webview
// never touches the filesystem directly; it calls these commands.
fn mailbox_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("mailbox");
    fs::create_dir_all(dir.join("inbox")).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn bridge_mailbox_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = mailbox_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn bridge_write_export(app: tauri::AppHandle, contents: String) -> Result<String, String> {
    let dir = mailbox_dir(&app)?;
    let target = dir.join("export.json");
    let tmp = dir.join("export.json.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Register the module + commands**

In `src-tauri/src/lib.rs`, add `mod bridge;` at the top and register the commands in the builder. The current `lib.rs` has no `invoke_handler`; add one:

```rust
mod bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      bridge::bridge_mailbox_path,
      bridge::bridge_write_export
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `pnpm tauri build --debug` (or `cargo build` inside `src-tauri`)
Expected: compiles with no errors. (Custom commands need no capability entry in Tauri 2.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/bridge.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): comandos del buzón — carpeta propia + escribir export"
```

---

### Task 15: Buzón bridge Phase 1 (JS) — export on change, desktop-only

**Files:**
- Create: `src/lib/bridge/tauri.ts`
- Create: `src/lib/bridge/BridgeLifecycle.svelte`
- Modify: `src/lib/bridge/index.ts`
- Modify: `src/routes/+page.svelte` (mount the lifecycle)
- Test: `src/lib/bridge/tauri.test.ts`

**Interfaces:**
- Consumes: `isTauriRuntime` from `$lib/platform/runtime`; `invoke` from `@tauri-apps/api/core`; `buildAgentExport` from `./export`.
- Produces:
  - `isBridgeAvailable()` → `isTauriRuntime()`.
  - `writeAgentExport()` (async) → builds the payload and calls `bridge_write_export`; a no-op returning `null` off desktop.
  - `getMailboxPath()` (async) → the mailbox path via `bridge_mailbox_path`, or `null` off desktop.
  - `BridgeLifecycle.svelte` — mounts nothing visible; on desktop, exports once on mount and again whenever `dataVersion` (a prop) changes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/bridge/tauri.test.ts` (runs under jsdom; stubs the runtime so it stays a no-op off desktop):

```js
import { describe, expect, it, vi } from 'vitest';
import * as runtime from '$lib/platform/runtime';
import { isBridgeAvailable, writeAgentExport, getMailboxPath } from './tauri';

describe('bridge tauri wrappers (off desktop)', () => {
	it('reports unavailable and no-ops on the web build', async () => {
		vi.spyOn(runtime, 'isTauriRuntime').mockReturnValue(false);
		expect(isBridgeAvailable()).toBe(false);
		expect(await writeAgentExport()).toBe(null);
		expect(await getMailboxPath()).toBe(null);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/tauri.test.ts`
Expected: FAIL — `./tauri` missing.

- [ ] **Step 3: Write the wrappers**

Create `src/lib/bridge/tauri.ts`:

```js
// Desktop-only IPC. The web/PWA build must expose no agent surface, so every
// entry point here short-circuits off Tauri. Import invoke lazily so the web
// bundle never depends on the Tauri API being present.
import { isTauriRuntime } from '$lib/platform/runtime';
import { buildAgentExport } from './export';

export function isBridgeAvailable() {
	return isTauriRuntime();
}

async function invoke(cmd, args) {
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke(cmd, args);
}

export async function getMailboxPath() {
	if (!isBridgeAvailable()) return null;
	return invoke('bridge_mailbox_path');
}

export async function writeAgentExport() {
	if (!isBridgeAvailable()) return null;
	const payload = await buildAgentExport();
	return invoke('bridge_write_export', { contents: JSON.stringify(payload, null, 2) });
}
```

Create `src/lib/bridge/BridgeLifecycle.svelte`:

```svelte
<script>
	import { isBridgeAvailable, writeAgentExport } from './tauri';

	// Bumping this prop (the app's dataVersion) re-exports the agent-visible
	// notes. Desktop-only: off Tauri the effect body no-ops.
	let { dataVersion = 0 } = $props();

	$effect(() => {
		// Read dataVersion so the effect re-runs when it changes.
		void dataVersion;
		if (!isBridgeAvailable()) return;
		writeAgentExport();
	});
</script>
```

Add to `src/lib/bridge/index.ts`:

```js
export { isBridgeAvailable, writeAgentExport, getMailboxPath } from './tauri';
export { default as BridgeLifecycle } from './BridgeLifecycle.svelte';
```

- [ ] **Step 4: Mount the lifecycle**

In `src/routes/+page.svelte`, import and mount it near the other lifecycle components. Add to the script imports:

```js
	import { BridgeLifecycle } from '$lib/bridge';
```

And in the markup, alongside the dialogs (near line 543), add:

```svelte
	<BridgeLifecycle {dataVersion} />
```

(`dataVersion` already exists in `+page.svelte` — it is used in the `{#key}` around the editor at line 655. If the reactive counter you want is `agendaVersion` or another, use whichever increments on note/block writes; `dataVersion` is correct here.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/bridge/tauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Desktop smoke check**

Run: `pnpm tauri dev`. Mark a note visible, add a todo. Confirm `<app_data_dir>/mailbox/export.json` contains the note and its task, and that a non-visible note is absent. On the web build (`pnpm dev`), confirm no errors and no export attempt.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bridge/tauri.ts src/lib/bridge/BridgeLifecycle.svelte src/lib/bridge/index.ts src/lib/bridge/tauri.test.ts src/routes/+page.svelte
git commit -m "feat(desktop): export del buzón al cambiar datos (solo escritorio)"
```

---

### Task 16: Buzón bridge Phase 2 (Rust) — watch the inbox, emit changes

**Files:**
- Modify: `src-tauri/src/bridge.rs`, `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` (add `notify`)

> **Verification note:** manual desktop verification (drop a JSON file into `mailbox/inbox/` and confirm the event fires). No Vitest.

**Interfaces:**
- Produces: `bridge_start_watch(app) -> Result<(), String>` — watches `mailbox/inbox/`; for each newly written `.json` file, reads it, emits a `bridge://change` event with the file text as payload, then moves the file to `mailbox/inbox/processed/` so it is not re-emitted.

- [ ] **Step 1: Add the `notify` dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
notify = "6"
```

- [ ] **Step 2: Add the watch command**

Append to `src-tauri/src/bridge.rs`:

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use tauri::Emitter;
use std::sync::mpsc::channel;

#[tauri::command]
pub fn bridge_start_watch(app: tauri::AppHandle) -> Result<(), String> {
    let dir = mailbox_dir(&app)?;
    let inbox = dir.join("inbox");
    let processed = inbox.join("processed");
    fs::create_dir_all(&processed).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(&inbox, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        for event in rx {
            let Ok(event) = event else { continue };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                continue;
            }
            for path in event.paths {
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(text) = fs::read_to_string(&path) {
                    let _ = app.emit("bridge://change", text);
                    if let Some(name) = path.file_name() {
                        let _ = fs::rename(&path, processed.join(name));
                    }
                }
            }
        }
    });
    Ok(())
}
```

- [ ] **Step 3: Register the command**

In `src-tauri/src/lib.rs`, add `bridge::bridge_start_watch` to the `generate_handler!` list.

- [ ] **Step 4: Build to verify it compiles**

Run: `pnpm tauri build --debug`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bridge.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(desktop): watcher del inbox del buzón + evento bridge://change"
```

---

### Task 17: Buzón bridge Phase 2 (JS) — ingest agent changes

**Files:**
- Modify: `src/lib/bridge/tauri.ts`, `src/lib/bridge/BridgeLifecycle.svelte`
- Test: `src/lib/bridge/tauri.test.ts`

**Interfaces:**
- Consumes: `listen` from `@tauri-apps/api/event`; `invoke` (`bridge_start_watch`); `ingestAgentChange` from `./ingest`.
- Produces:
  - `startBridgeWatch(onIngested)` (async) → starts the Rust watcher and subscribes to `bridge://change`; for each event, parses the JSON, calls `ingestAgentChange`, and invokes `onIngested()` on a successful write so the app can refresh + re-export. Returns an unlisten function. No-op returning a noop off desktop.
  - `BridgeLifecycle.svelte` also starts the watcher on mount (desktop-only) and, after each ingested change, re-exports and bumps a callback so the UI refreshes.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/bridge/tauri.test.ts`:

```js
import { startBridgeWatch } from './tauri';

it('startBridgeWatch is a no-op off desktop and returns an unlisten fn', async () => {
	vi.spyOn(runtime, 'isTauriRuntime').mockReturnValue(false);
	const stop = await startBridgeWatch(() => {});
	expect(typeof stop).toBe('function');
	expect(() => stop()).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/tauri.test.ts`
Expected: FAIL — `startBridgeWatch` not exported.

- [ ] **Step 3: Add the watcher wiring**

Append to `src/lib/bridge/tauri.ts`:

```js
import { ingestAgentChange } from './ingest';

// Starts the Rust inbox watcher and ingests each agent change through the gate
// + task-action layer. onIngested() fires after a successful write so the app
// can refresh its views and re-export. No-op off desktop.
export async function startBridgeWatch(onIngested) {
	if (!isBridgeAvailable()) return () => {};
	const { listen } = await import('@tauri-apps/api/event');
	const unlisten = await listen('bridge://change', async (event) => {
		let change;
		try {
			change = JSON.parse(event.payload);
		} catch {
			return; // malformed file: ignore, like a bad paste
		}
		const res = await ingestAgentChange(change);
		if (res.ok) await onIngested?.();
	});
	await invoke('bridge_start_watch');
	return unlisten;
}
```

Update `src/lib/bridge/BridgeLifecycle.svelte` to start the watcher and re-export after ingest:

```svelte
<script>
	import { isBridgeAvailable, writeAgentExport, startBridgeWatch } from './tauri';

	let { dataVersion = 0, onAgentIngested } = $props();

	// Export agent-visible notes whenever the data changes (Phase 1).
	$effect(() => {
		void dataVersion;
		if (!isBridgeAvailable()) return;
		writeAgentExport();
	});

	// Watch the inbox and ingest agent changes (Phase 2). Cleanup on unmount.
	$effect(() => {
		if (!isBridgeAvailable()) return;
		let unlisten = () => {};
		startBridgeWatch(async () => {
			await writeAgentExport();
			onAgentIngested?.();
		}).then((fn) => (unlisten = fn));
		return () => unlisten();
	});
</script>
```

In `src/routes/+page.svelte`, pass a refresh callback that re-reads the current note. Use the existing `handleDataChanged` handler (already wired for backup/import refresh):

```svelte
	<BridgeLifecycle {dataVersion} onAgentIngested={handleDataChanged} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/bridge/tauri.test.ts`
Expected: PASS.

- [ ] **Step 5: Desktop end-to-end smoke check**

Run: `pnpm tauri dev`. Mark a note visible. Drop `mailbox/inbox/change.json` containing `{"type":"createTask","noteId":"<id>","content":"desde el agente","agentId":"agent"}` (use a real visible note id from `export.json`). Confirm: the task appears in the app, a `created` entry shows in Settings > Agentes, the file moves to `inbox/processed/`, and `export.json` refreshes. Drop a change targeting a NON-visible note and confirm it is rejected (no task created).

- [ ] **Step 6: Full suite + commit**

Run: `pnpm test` (expect green), then:

```bash
git add src/lib/bridge/tauri.ts src/lib/bridge/BridgeLifecycle.svelte src/lib/bridge/tauri.test.ts src/routes/+page.svelte
git commit -m "feat(desktop): ingest de cambios del agente (buzón bidireccional)"
```

---

## Self-Review

**1. Spec coverage (028 → task):**

| Spec 028 element | Task |
|---|---|
| Task-action layer, single write path | 5–8 (bridge routes through it: 10, 17) |
| Per-task activity log ("bitácora"), `activity` table | 1, 2 |
| Task origin (`createdBy`) | 4 |
| "Visible to agents" note flag (`agentVisible`) | 4 (field), 11 (control) |
| Buzón bridge Tauri — Phase 1 read-only export | 14, 15 |
| Buzón bridge — Phase 2 two-way ingest | 16, 17 |
| Conservative trust surface (single agent, one entry/write, done-with-trace) | 3, 6, 10, 17 |
| Settings > Agentes view | 12 |
| Data model: Note/Block fields, Activity table, connected agent | 1, 3, 4 |
| Acceptance: gate at export boundary + test | 9 |
| Acceptance: agent input through ingest gate | 10 |
| Acceptance: uncheck + user note round-trips as reopen | 7, 8 (helper), 13 (UI) |
| Acceptance: desktop-only, no browser surface | 15 (`isBridgeAvailable`), tests in 15/17 |
| Acceptance: no delete/export/bulk-reorder | 10 (`not-allowed`), 17 |
| Minimum tests: task-action create/complete/reopen | 5, 6, 7 |
| Minimum test: agent-visibility gate | 9 |
| Minimum test: ingest gate | 10 |
| Minimum test: activity order by `at` | 2 |
| Minimum test: redo round-trip | 7, 8 |

No spec element is left without a task.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" left. The two soft spots are (a) the e2e seeding helper in Tasks 11–13, which depends on the repo's existing e2e boot convention — flagged inline with a fallback, not a blank; and (b) the `dataVersion`/`handleDataChanged` names in `+page.svelte`, both verified present in the current file. The redo UI (Task 13) is explicitly flagged as beyond the literal "What Enters" list, with a defer path.

**3. Type/name consistency:** `createTask`/`completeTask`/`reopenTask`/`addTaskNote`/`editTask`/`readTask`/`listTasks`/`isRedoRequested` are named identically across the barrel (Tasks 5–8) and consumers (10, 13, 17). Activity fields `{ id, blockId, noteId, actor, action, text, at, deletedAt }` are consistent across repo (2), task layer (5–8), export (9), and UI (12). Rust command names `bridge_mailbox_path` / `bridge_write_export` / `bridge_start_watch` and the `bridge://change` event match between Rust (14, 16) and JS (15, 17). Export payload shape (`format`/`version`/`notes[].tasks[]`) is consistent between `toAgentPayload` and its test.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-agente-beta-mcp-local.md`.
