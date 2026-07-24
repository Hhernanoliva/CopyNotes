# MCP Real + Cimientos — Revised Implementation Plan (supersedes the bridge half of 2026-07-23-agente-beta-mcp-local.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Track durable progress in `.superpowers/sdd/progress.md`.

**Goal:** Turn the CopyNotes "agent beta" into a REAL MCP server a standard client (Claude Desktop / OpenCode) can connect to — while first hardening the already-built foundation against the concrete correctness/security gaps an external review found.

**Architecture:** CopyNotes data lives in IndexedDB (browser/webview), unreachable by a separate process. So the desktop (Tauri) app is the bridge: it syncs agent-visible tasks to a local **buzón** folder (data plane) and applies agent change-requests dropped there. A standalone **Node stdio MCP server** (`mcp/`, using `@modelcontextprotocol/sdk`) sits on top of the buzón and speaks real MCP to clients — exposing resources (agent-visible tasks) and tools (create/complete/annotate). The buzón becomes a tiny request/response RPC (inbox → app applies → outbox result) with idempotency by change id. The existing task-action layer + privacy gate are reused unchanged in shape. Limitation (accepted for the beta): CopyNotes must be running for a round-trip.

**Tech Stack:** SvelteKit + Svelte 5 (runes) · Dexie/IndexedDB · Tauri 2 (Rust, `notify`) · Node + `@modelcontextprotocol/sdk` (stdio) · Vitest (node + jsdom) · Playwright.

## Status Going In (already built on branch `feat/agente-beta-mcp-local`, base 23da5f1)

DONE and reviewed (see `.superpowers/sdd/progress.md`): Tasks 1–14 of the prior plan — migration v6 `activity` table, `activity`/`agents` repos, task-action layer (`src/lib/tasks/`), bridge export gate + ingest (`src/lib/bridge/`), header "Visible para agentes" toggle, Settings > Agentes view + "Rehacer", Rust buzón Phase 1 (`src-tauri/src/bridge.rs`). Suite 634 unit + e2e green; our code svelte-check clean (2 pre-existing `db.migrations.test.ts` errors remain). Branch UNMERGED / UNPUSHED.

This plan does NOT redo that. It (a) fixes the verified gaps, (b) upgrades the buzón to an RPC, (c) adds the real MCP server, (d) leaves the risky "single door" editor rewire for last behind an approval gate.

## Global Constraints

- **Storage is the only data path.** Task-action layer + repositories; never Dexie directly from UI/bridge/MCP.
- **Agent input is untrusted.** Every agent-written field passes `format/ingest.ts` + `sanitize.ts` before storage. `block.html` is a stored-XSS sink.
- **Privacy gate is source of truth.** `note.agentVisible !== true` ⇒ never exported and never a valid ingest target. Re-export MUST happen whenever visibility changes.
- **Actor is trusted, not claimed.** The activity `actor` for agent writes comes from the stored connected-agent identity (`getConnectedAgent`), NOT from the inbound change file. A file can never forge `actor:"user"`.
- **One activity entry per action, atomically.** Block mutation + its activity row commit in ONE Dexie transaction. Never a half-write.
- **Only live todos.** The agent may only create tasks or act on existing `type === 'todo'` blocks. No text/bullet/code/separator, no delete/export/reorder.
- **Idempotent ingest.** Each change carries a unique id; applying it twice yields the same single result (dedupe).
- **Desktop-only reach.** The MCP round-trip needs Tauri; the browser/PWA build exposes no agent surface. `isTauriRuntime()`.
- **No SQLite migration.** Desktop keeps IndexedDB; the buzón is the only cross-process data plane.
- **Cloud-ready discipline.** New persisted fields: stable id, timestamps, soft delete.
- **Docs rule (CLAUDE.md).** Every user-visible change updates `docs/guia/` in the same commit + the index date.
- **Plain-JS style** in hand-written `.ts`/`.svelte` (no annotations). Rust is normal Rust. `cargo` via `export PATH="$HOME/.cargo/bin:$PATH"`, verify with `cargo check` in `src-tauri` (not full `tauri build`).
- **Tests:** node (`server`) with `fake-indexeddb`; jsdom for anything calling `sanitizeHtml`; `src/lib/bridge/**` already routed to jsdom. The MCP server (`mcp/`) is plain Node — its own Vitest tests.

---

## Milestones

- **G — Foundation hardening** (G1–G7): fix the verified review findings in already-built code. Mostly additive, low risk. Vitest + one e2e.
- **P — Buzón RPC protocol** (P1–P3): inbox→outbox request/response with change ids + idempotency; Rust two-way; JS ingest wiring. Replaces the old Tasks 15–17 approach.
- **M — Real MCP server** (M1–M4): standalone Node stdio server over the buzón; resources + tools; client config + Settings path display.
- **S — Single door** (S1): route Editor + Agenda through the task-action layer. HIGH RISK, LAST, behind an explicit approval gate (do not start without Hernan's go).

Recommended order: G → P → M → (gate) → S. G and P make the agent path trustworthy; M makes it real MCP; S is the spec-purity/cloud step done carefully.

---

### Task G1: Atomic task mutation + activity (one transaction)

**Files:**
- Modify: `src/lib/tasks/actions.ts` (createTask, completeTask, reopenTask, addTaskNote, editTask)
- Modify/add repo helper: `src/lib/storage/activity.ts` (a transaction-aware append) and/or `src/lib/storage/index.ts`
- Test: `src/lib/tasks/actions.test.ts`

**Problem:** today each action writes the block, then appends activity as a SEPARATE Dexie op. If the second fails, an action leaves no trace (or a create leaves an orphan). Wrap block-write + activity-append in one `db.transaction('rw', ...)`.

**Interfaces:**
- Produces a private helper in `actions.ts`: `mutateAndTrace({ blockId, changes, noteId, actor, action, text, createFields })` that runs a single `db.transaction('rw', db.table('blocks'), db.table('activity'), async () => { ... })` performing the block create/update AND the activity append, returning `{ block, activity }`. All five public functions route through it.
- `appendActivity` must be callable INSIDE an existing transaction (Dexie allows nested `db.transaction` calls to join the parent). Keep `appendActivity` using `db.table('activity')` — inside a parent rw transaction it joins automatically.

- [ ] **Step 1: Write the failing test** (inject a fault to prove atomicity)

Add to `src/lib/tasks/actions.test.ts`:

```js
import { db } from '$lib/storage';

describe('atomicity', () => {
	it('does not append activity if the block write fails', async () => {
		const note = await createNote();
		const { block } = await createTask({ noteId: note.id, content: 'T', actor: 'user' });
		const before = (await listActivityByBlock(block.id)).length;

		// Force the activity write to throw mid-transaction; the block change must roll back too.
		const activityTable = db.table('activity');
		const original = activityTable.add.bind(activityTable);
		activityTable.add = () => Promise.reject(new Error('boom'));
		try {
			await expect(completeTask({ blockId: block.id, actor: 'agent' })).rejects.toThrow('boom');
		} finally {
			activityTable.add = original;
		}

		const reread = await getBlock(block.id);
		expect(reread.checked).toBe(false); // rolled back
		expect((await listActivityByBlock(block.id)).length).toBe(before); // no orphan entry
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: FAIL — today the block is already checked before the activity add throws, so `reread.checked` is `true`.

- [ ] **Step 3: Introduce the transaction helper and route all mutators through it**

In `src/lib/tasks/actions.ts`, add near the top (after imports):

```js
import { db } from '$lib/storage';

// Block change + its one bitácora entry commit together or not at all, so an
// action can never leave a task mutated without its trace (or vice versa).
async function traceWrite({ blockId, changes, noteId, actor, action, text }) {
	return db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await updateBlock(blockId, changes);
		if (!block) return undefined;
		const activity = await appendActivity({ blockId, noteId: block.noteId, actor, action, text });
		return { block, activity };
	});
}
```

Rewrite `completeTask`/`reopenTask`/`editTask` to call `traceWrite`. Example completeTask:

```js
export async function completeTask({ blockId, actor, text = '' }) {
	return traceWrite({ blockId, changes: { checked: true }, actor, action: 'done', text });
}
```

reopenTask → `changes: { checked: false }, action: 'reopened'`. editTask → `changes: { content, html: html !== undefined ? html : plainTextToHtml(content) }, action: 'edited', text: content`.

For `addTaskNote` (no block change) wrap the read + append in a transaction too so a concurrent delete is consistent:

```js
export async function addTaskNote({ blockId, actor = 'user', text }) {
	return db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await getBlock(blockId);
		if (!block) return undefined;
		const activity = await appendActivity({ blockId, noteId: block.noteId, actor, action: 'note', text });
		return { activity };
	});
}
```

For `createTask`, wrap the createBlock + append in one transaction:

```js
export async function createTask({ noteId, parentBlockId = null, content = '', html = undefined, actor = 'user' }) {
	return db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await createBlock({
			noteId, parentBlockId, type: 'todo', content,
			html: html ?? plainTextToHtml(content), createdBy: actor
		});
		const activity = await appendActivity({ blockId: block.id, noteId, actor, action: 'created', text: content });
		return { block, activity };
	});
}
```

(Note: `updateBlock`/`createBlock`/`appendActivity` all call `trackPendingWrite`, which nests fine inside `db.transaction`; the outer transaction is the atomic unit.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit -- --run src/lib/tasks/actions.test.ts`
Expected: PASS (atomicity test + all prior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/actions.ts src/lib/tasks/actions.test.ts
git commit -m "fix(tasks): tarea+bitácora en una sola transacción (atómico)"
```

---

### Task G2: Monotonic causal order (`seq`) — retire the wall-clock tiebreak

**Files:**
- Modify: `src/lib/storage/activity.ts` (add `seq`, order by it)
- Modify: `src/lib/tasks/actions.test.ts`, `src/lib/storage/activity.test.ts` (remove the `vi.spyOn(ids,'now')` clock hack — order is now deterministic by seq)
- Test: `src/lib/storage/activity.test.ts`

**Problem:** two entries in the same millisecond tie on `at` and fall back to a random-uuid tiebreak; `isRedoRequested` depends on the LAST entry, so redo can misfire. Add a monotonic `seq` assigned inside the append transaction and order by it.

**Interfaces:**
- `appendActivity` now sets `seq = (max existing seq) + 1`, computed inside the same rw transaction (so concurrent appends can't collide). Row shape gains `seq` (integer, ≥ 0).
- `listActivityByBlock`/`listActivityByNote` order ascending by `seq`; `listRecentActivity` descending by `seq`. `at` stays for display only.
- No Dexie index needed (sort in JS); no migration (the feature never shipped, so no pre-seq rows exist in any real DB; new rows always carry seq).

- [ ] **Step 1: Write the failing test**

In `src/lib/storage/activity.test.ts`, first REMOVE the `vi.spyOn(ids, 'now')` monotonic-clock block from `beforeEach` (and the `afterEach` restore + the `import * as ids`), leaving only the table clear. Then the existing order tests must still pass by seq. Add:

```js
it('orders by a monotonic seq, independent of the wall clock', async () => {
	// Same wall-clock ms for all three; order must still be insertion order.
	const rows = [];
	for (const text of ['a', 'b', 'c']) {
		rows.push(await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'note', text }));
	}
	expect(rows.map((r) => r.seq)).toEqual([...rows.map((r) => r.seq)].sort((x, y) => x - y));
	expect((await listActivityByBlock('b1')).map((r) => r.text)).toEqual(['a', 'b', 'c']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/storage/activity.test.ts`
Expected: FAIL — `seq` is undefined; ordering falls back to `at`/uuid.

- [ ] **Step 3: Add seq and order by it**

In `src/lib/storage/activity.ts`:

```js
export function appendActivity({ blockId, noteId, actor, action, text = '' }) {
	return trackPendingWrite(() =>
		db.transaction('rw', activity, async () => {
			const rows = await activity.toArray();
			const maxSeq = rows.reduce((m, r) => (typeof r.seq === 'number' && r.seq > m ? r.seq : m), -1);
			const row = {
				id: createId(),
				blockId, noteId, actor, action, text,
				seq: maxSeq + 1,
				at: now(),
				deletedAt: null
			};
			await activity.add(row);
			return row;
		})
	);
}

function bySeqAsc(a, b) {
	return (a.seq ?? 0) - (b.seq ?? 0);
}
```

Replace `byAtAsc` usages: `listActivityByBlock`/`listActivityByNote` sort with `bySeqAsc`; `listRecentActivity` sorts with `(a, b) => bySeqAsc(b, a)` then slices.

- [ ] **Step 4: Remove the clock hack from actions.test.ts**

In `src/lib/tasks/actions.test.ts`, remove the `vi.spyOn(ids, 'now')` monotonic block + `afterEach` + `import * as ids` (added earlier to paper over this). The redo-round-trip order test now passes by seq.

- [ ] **Step 5: Run to verify pass (both files, repeated to prove non-flaky)**

Run: `for i in 1 2 3 4 5; do pnpm test:unit -- --run src/lib/storage/activity.test.ts src/lib/tasks/actions.test.ts || break; done`
Expected: PASS all 5 runs (deterministic by seq, no clock stub).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/activity.ts src/lib/storage/activity.test.ts src/lib/tasks/actions.test.ts
git commit -m "fix(activity): orden causal por seq monotónico (retira el truco de reloj)"
```

---

### Task G3: Actor from the connected-agent identity (no spoofing) + single-agent

**Files:**
- Modify: `src/lib/bridge/ingest.ts` (derive actor from stored identity)
- Modify: `src/lib/storage/agents.ts` if needed (an `ensureConnectedAgent()` convenience)
- Test: `src/lib/bridge/ingest.test.ts`

**Problem:** `ingestAgentChange` passes the untrusted `change.agentId` as `actor`. A file can send `actor:"user"` to forge attribution and hide the "Rehacer" control. Derive the actor from `getConnectedAgent()`; the file's agentId is ignored (or, at most, validated to match).

**Interfaces:**
- `ingestAgentChange(change)` looks up the connected agent once via `getConnectedAgent()`; if none exists it lazily registers one (`setConnectedAgent({ name: 'Agente local' })`) — this is the single-agent identity. The actor passed to the task-action layer is `agent.id` (never `'user'`, never the file's claim). This wires the Task-3 repo into the real path (it is no longer dead code).
- v1 single agent: there is exactly one connected-agent row; every ingest is attributed to it.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/bridge/ingest.test.ts`:

```js
import { getConnectedAgent } from '$lib/storage';

it('attributes agent writes to the stored agent identity, ignoring a spoofed actor', async () => {
	const note = await createNote();
	await updateNote(note.id, { agentVisible: true });

	// A malicious file claims to be the user.
	const res = await ingestAgentChange({
		type: 'createTask', noteId: note.id, content: 'x', agentId: 'user'
	});
	expect(res.ok).toBe(true);

	const agent = await getConnectedAgent();
	const [task] = await listTasks(note.id);
	const log = await listActivityByBlock(task.id);
	expect(log[0].actor).toBe(agent.id);   // the real agent id
	expect(log[0].actor).not.toBe('user'); // never the spoofed value
});
```

(Add `listActivityByBlock` to the test's `$lib/storage` import.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: FAIL — actor is `'user'` (the spoofed value).

- [ ] **Step 3: Derive the actor in ingest**

In `src/lib/bridge/ingest.ts`, add imports `getConnectedAgent, setConnectedAgent` from `$lib/storage`. Resolve the actor before dispatch and pass it to the handlers instead of `change.agentId`:

```js
async function resolveAgentActor() {
	let agent = await getConnectedAgent();
	if (!agent) agent = await setConnectedAgent({ name: 'Agente local' });
	return agent.id;
}
```

Change `ingestAgentChange` so, after the visibility gate passes, it computes `const actor = await resolveAgentActor();` and calls `handler(change, actor)`. Update each handler signature to `(change, actor)` and use `actor` (not `change.agentId`), e.g.:

```js
async createTask(change, actor) {
	return createTask({ noteId: change.noteId, content: toCleanText(change.content), actor });
},
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridge/ingest.ts src/lib/bridge/ingest.test.ts
git commit -m "fix(bridge): autor tomado de la identidad del agente conectado (no del archivo)"
```

---

### Task G4: Validate the target is a live todo + strict field validation

**Files:**
- Modify: `src/lib/bridge/ingest.ts`
- Test: `src/lib/bridge/ingest.test.ts`

**Problem:** ingest only checks the note is visible; a `completeTask`/`addNote` with a `blockId` pointing at a `text` block would set `checked:true`/append activity on a non-task. Also missing field-type/size checks.

**Interfaces:**
- For `completeTask`/`addNote`, after resolving the block (already done for the note gate in the prior fix), also require `block.type === 'todo'` — else `{ ok: false, reason: 'not-a-task' }`.
- Field validation: `content`/`text` must be strings; cap length (e.g. 2000 chars) — over-length is truncated by `toCleanText` wrapping, or rejected `{ ok:false, reason:'invalid' }`. Keep it simple: coerce non-strings to `''`, cap to 2000.

- [ ] **Step 1: Write the failing test**

```js
it('rejects completing a non-todo block', async () => {
	const note = await createNote();
	await updateNote(note.id, { agentVisible: true });
	const textBlock = await createBlock({ noteId: note.id, type: 'text', content: 'prosa' });

	const res = await ingestAgentChange({
		type: 'completeTask', noteId: note.id, blockId: textBlock.id, agentId: 'agent'
	});
	expect(res.ok).toBe(false);
	expect(res.reason).toBe('not-a-task');
	expect((await getBlock(textBlock.id)).checked).toBe(false);
});
```

(Add `createBlock`, `getBlock` to imports.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: FAIL — the text block gets `checked:true`, res.ok true.

- [ ] **Step 3: Add the todo gate + length cap**

In `ingestAgentChange`, in the branch that resolves `getBlock(change.blockId)` for completeTask/addNote (from G3/Task-10 fix), add after the visibility check:

```js
	if (change.type !== 'createTask' && block.type !== 'todo') {
		return { ok: false, reason: 'not-a-task' };
	}
```

In `toCleanText`, cap length: `return htmlToPlainText(sanitizeHtml(typeof raw === 'string' ? raw : '')).slice(0, 2000);`

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit -- --run src/lib/bridge/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridge/ingest.ts src/lib/bridge/ingest.test.ts
git commit -m "fix(bridge): el destino debe ser una tarea (todo) viva + límite de longitud"
```

---

### Task G5: "Rehacer" refreshes the open editor + e2e asserts the uncheck

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte` (emit a change signal), `src/routes/+page.svelte` (bump the data signal / refresh)
- Modify: `e2e/agent-redo.spec.ts` (assert the task actually unchecks in the note)

**Problem:** `submitRedo` unchecks the task in the DB but the open Editor keeps its in-memory copy, so the box stays checked until note-switch/reload. And the e2e only checks the instruction text.

**Interfaces:**
- `SettingsDialog` gains an `onDataChanged` prop (callback). `submitRedo` calls it after the DB writes. `+page.svelte` passes `onDataChanged={handleDataChanged}` (the existing handler that bumps `dataVersion` and re-reads — same one used by BackupDialog). Bumping `dataVersion` remounts the editor for the current note, which re-reads the block from storage (now unchecked).

- [ ] **Step 1: Extend the e2e to assert the uncheck**

In `e2e/agent-redo.spec.ts`, after submitting the redo, close Settings and assert the task's checkbox in the note is unchecked. Seed the note so it's the OPEN note (the app opens the most-recent/last note). Add after the "Enviar" click:

```js
	// Close settings and confirm the task is now unchecked in the note itself.
	await page.getByRole('button', { name: 'Cerrar' }).click();
	// The seeded note's todo checkbox reflects the reopened (unchecked) state.
	await expect(page.locator('[role="checkbox"]').first()).toHaveAttribute('aria-checked', 'false');
```

(If the seeded note is not the open one, first select it via the sidebar — adapt to the suite's note-selection helper. If selecting is awkward, assert instead that reopening Settings shows a `reopened` entry — but prefer the visible uncheck.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec playwright test e2e/agent-redo.spec.ts --project=chromium`
Expected: FAIL — checkbox still `aria-checked="true"` (editor not refreshed).

- [ ] **Step 3: Wire the refresh signal**

In `SettingsDialog.svelte` script: add `onDataChanged` to `$props()`. In `submitRedo`, after `activity = await listRecentActivity(20);` add `onDataChanged?.();`.

In `+page.svelte`, where `<SettingsDialog ... />` is mounted, add `onDataChanged={handleDataChanged}`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec playwright test e2e/agent-redo.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte src/routes/+page.svelte e2e/agent-redo.spec.ts
git commit -m "fix(ui): Rehacer refresca el editor abierto (la tarea se destilda al instante)"
```

---

### Task G6: Backups handle the `activity` table

**Files:**
- Modify: `src/lib/storage/backup.ts` (`replaceAllTables` clears activity), and the JSON format (`src/lib/export-import/schema.ts`, `src/lib/export-import/backup.ts`) IF we choose to include it
- Test: `src/lib/storage/backup.test.ts`

**Decision (recommended):** the bitácora is device-local audit history — do NOT put it in the portable backup file (consistent with it being the 012 audit entity, and keeping backups about user content). BUT `replaceAllTables` ("Reemplazar todo") MUST clear the `activity` table, else stale activity rows survive a full restore and mis-attach to restored/renamed tasks. So: exclude from export/import; clear on replace.

**Interfaces:**
- `replaceAllTables` includes `activity` in the set of tables it clears before writing the imported data.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/backup.test.ts`:

```js
it('replaceAllTables clears prior activity rows', async () => {
	await db.table('activity').add({ id: 'old', blockId: 'b', noteId: 'n', actor: 'agent', action: 'done', text: '', seq: 0, at: '2026-01-01T00:00:00.000Z', deletedAt: null });
	// A minimal valid dump with no activity.
	await replaceAllTables({ notes: [], blocks: [], snippets: [], tags: [], tagAssignments: [], folders: [], settings: [] });
	expect(await db.table('activity').count()).toBe(0);
});
```

(Match the exact `replaceAllTables` argument shape used elsewhere in that test file; adjust keys if the real signature differs.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/storage/backup.test.ts`
Expected: FAIL — the `old` activity row survives.

- [ ] **Step 3: Clear activity on replace**

In `src/lib/storage/backup.ts` `replaceAllTables`, add `activity` to the list of tables cleared before repopulating (find where it clears notes/blocks/etc. and include `db.table('activity').clear()`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:unit -- --run src/lib/storage/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/backup.ts src/lib/storage/backup.test.ts
git commit -m "fix(backup): Reemplazar todo limpia la tabla activity (sin registros huérfanos)"
```

---

### Task G7: Real export trigger (never leave a hidden note exported)

**Files:**
- Create: `src/lib/bridge/signal.ts` (a tiny reactive "agent data changed" version counter)
- Modify: `src/lib/tasks/actions.ts`, `src/lib/storage/notes.ts` (or a wrapper) to bump the signal on agent-relevant writes + agentVisible changes
- Modify: `src/lib/bridge/BridgeLifecycle.svelte` to depend on the signal (not `dataVersion`)
- Test: `src/lib/bridge/signal.test.ts`

**Problem:** `dataVersion` is deliberately NOT bumped on in-note edits or the agentVisible toggle (+page.svelte:72). Keying the export on it means task edits and — critically — hiding a note would NOT re-export, leaving a hidden note's tasks in `export.json` (privacy hole).

**Interfaces:**
- `src/lib/bridge/signal.ts` exports `agentDataVersion` (a Svelte `$state`-friendly getter) and `bumpAgentData()`. Implement as a module-level `{ value: 0 }` reactive via a Svelte store OR a simple `$state` in a `.svelte.ts` module: `export const agentData = $state({ version: 0 }); export function bumpAgentData(){ agentData.version++ }`. (Use a `.svelte.ts` module so `$state` is allowed.)
- Call `bumpAgentData()` after: any task-action-layer mutation (createTask/completeTask/reopenTask/addTaskNote/editTask) and after `updateNote` when `agentVisible` is in the changes. Keep it out of hot per-keystroke paths (task text edits via the editor are out of scope until Milestone S; the agent-relevant writes are the task-action layer + the visibility toggle).
- `BridgeLifecycle.svelte`'s `$effect` reads `agentData.version` (so it re-runs on bump) and calls `writeAgentExport()` (desktop-only).

- [ ] **Step 1: Write the failing test** (signal bumps on the right events)

Create `src/lib/bridge/signal.test.ts` (node):

```js
import { describe, expect, it } from 'vitest';
import { agentData, bumpAgentData } from './signal.svelte';

describe('agent data signal', () => {
	it('increments on bump', () => {
		const before = agentData.version;
		bumpAgentData();
		expect(agentData.version).toBe(before + 1);
	});
});
```

Also add a task-layer test asserting the bump fires (in `actions.test.ts`): spy on the signal is awkward with `$state`; instead assert the version increased across a createTask call:

```js
it('bumps the agent-data signal on a task action', async () => {
	const { agentData } = await import('$lib/bridge/signal.svelte');
	const note = await createNote();
	const before = agentData.version;
	await createTask({ noteId: note.id, content: 'x', actor: 'user' });
	expect(agentData.version).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit -- --run src/lib/bridge/signal.test.ts src/lib/tasks/actions.test.ts`
Expected: FAIL — module missing / no bump.

- [ ] **Step 3: Implement the signal and bump it**

Create `src/lib/bridge/signal.svelte.ts`:

```js
// A tiny reactive counter the desktop bridge watches to know WHEN to re-export
// agent-visible tasks. Bumped on every agent-relevant write and on any
// agentVisible change — so hiding a note always triggers a re-export (a hidden
// note can never linger in export.json).
export const agentData = $state({ version: 0 });

export function bumpAgentData() {
	agentData.version++;
}
```

In `src/lib/tasks/actions.ts`, import `bumpAgentData` and call it at the end of each of the five mutators (after the transaction resolves, before returning). Add a single wrapper if cleaner (e.g. have `traceWrite` and the two non-traceWrite paths call `bumpAgentData()` on success).

In `src/lib/storage/notes.ts` `updateNote`, after the write, if `'agentVisible' in changes` call `bumpAgentData()`. (Import lazily to avoid a storage→bridge cycle: `const { bumpAgentData } = await import('$lib/bridge/signal.svelte'); bumpAgentData();` — or move the signal to a dependency-free module both can import. Prefer moving the bump call into the task-action layer + a small hook in the toggle handler in Editor.svelte instead of notes.ts, to avoid the cycle: in `Editor.svelte toggleAgentVisible`, after scheduleSave, call `bumpAgentData()`.)

Decision to keep it clean: bump from (a) the task-action layer mutators and (b) `Editor.svelte`'s `toggleAgentVisible` — NOT from `notes.ts` (avoids the storage↔bridge import cycle).

- [ ] **Step 4: Point BridgeLifecycle at the signal**

In `src/lib/bridge/BridgeLifecycle.svelte`, replace the `dataVersion` dependency with the signal:

```svelte
<script>
	import { isBridgeAvailable, writeAgentExport } from './tauri';
	import { agentData } from './signal.svelte';

	$effect(() => {
		void agentData.version; // re-run whenever agent-relevant data changes
		if (!isBridgeAvailable()) return;
		writeAgentExport();
	});
</script>
```

Remove the `dataVersion` prop usage; update the `<BridgeLifecycle />` mount in `+page.svelte` accordingly (no prop needed now).

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test:unit -- --run src/lib/bridge/signal.test.ts src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bridge/signal.svelte.ts src/lib/bridge/signal.test.ts src/lib/tasks/actions.ts src/lib/editor/Editor.svelte src/lib/bridge/BridgeLifecycle.svelte src/routes/+page.svelte src/lib/tasks/actions.test.ts
git commit -m "fix(bridge): reexportar ante cambios reales (ocultar una nota siempre reexporta)"
```

---

### Task P1: Buzón becomes request/response with change ids (JS ingest side)

**Files:**
- Modify: `src/lib/bridge/ingest.ts` (accept a change `id`, return an idempotent result), add `src/lib/bridge/protocol.ts` (shapes/helpers)
- Test: `src/lib/bridge/ingest.test.ts`

**Problem:** the MCP server needs a real result per request, and duplicate delivery must not double-apply. Give each change a unique `id`; record processed ids and their result so re-applying returns the same result.

**Interfaces:**
- Change shape: `{ id, type, noteId?, blockId?, content?, text? }`. (No `agentId` — actor is derived, G3.)
- `ingestAgentChange(change)` → `{ id, ok, reason?, result? }`. It records processed change ids (in a small `processedChanges` settings row, or a dedicated table) with their result; a repeat id returns the stored result without re-applying.
- `src/lib/bridge/protocol.ts`: constants for reasons and a `resultFor(change, outcome)` builder; the inbox/outbox file names use `id`.

- [ ] **Step 1: Write the failing test (idempotency)**

```js
it('is idempotent: the same change id applied twice yields one task and the same result', async () => {
	const note = await createNote();
	await updateNote(note.id, { agentVisible: true });
	const change = { id: 'chg-1', type: 'createTask', noteId: note.id, content: 'una' };

	const a = await ingestAgentChange(change);
	const b = await ingestAgentChange(change);
	expect(a.ok).toBe(true);
	expect(b).toEqual(a);                 // same result, not re-applied
	expect(await listTasks(note.id)).toHaveLength(1); // only one task created
});
```

- [ ] **Step 2: Run to verify it fails** → duplicate creates two tasks.

- [ ] **Step 3: Add id + dedupe**

Add a `processedChanges` map persisted via a settings row (dependency-light) or a tiny table. Simplest: a `dedupe` table `id` (change id) holding the stored result. In `ingestAgentChange`, first look up `dedupe.get(change.id)`; if present return its result. After a successful (or definitively-failed) apply, store `{ id: change.id, result }`. Return `{ id: change.id, ...outcome }`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(bridge): ingest idempotente por id de cambio (protocolo de buzón)"
```

---

### Task P2: Rust two-way — watch inbox, emit; app writes outbox

**Files:**
- Modify: `src-tauri/src/bridge.rs` (add `bridge_start_watch` using `notify`; add `bridge_write_outbox`), `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- Verify: `cargo check`

**Interfaces (Rust commands):**
- `bridge_start_watch(app)`: watches `mailbox/inbox/` for new `*.json`; for each, reads it, emits `bridge://change` with the file text, moves the file to `inbox/processed/`.
- `bridge_write_outbox(app, id, contents)`: writes `mailbox/outbox/<id>.json` atomically (temp+rename). The MCP server polls this file for the result.

- [ ] **Step 1: Add `notify` to Cargo.toml** (`notify = "6"`).
- [ ] **Step 2: Implement `bridge_start_watch` + `bridge_write_outbox`** (real code as in the prior plan's Task 16 for the watcher; `bridge_write_outbox` mirrors `bridge_write_export` but to `outbox/<id>.json`, creating `outbox/`). Register both in `lib.rs` `generate_handler!`.
- [ ] **Step 3: Verify** `export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo check` → 0 errors.
- [ ] **Step 4: Commit** `feat(desktop): watcher del inbox + escritura de outbox (buzón bidireccional)`.

> Rust has no Vitest — gate is `cargo check`. Full round-trip is manual on Hernan's Mac (Milestone M's verification).

---

### Task P3: JS wiring — export on signal, watch, ingest, write outbox

**Files:**
- Rewrite: `src/lib/bridge/tauri.ts` (export on signal via `writeAgentExport`; `startBridgeWatch` listens `bridge://change`, calls `ingestAgentChange`, then `bridge_write_outbox(id, result)`), `src/lib/bridge/BridgeLifecycle.svelte` (start the watch on mount, desktop-only, cleanup)
- Test: `src/lib/bridge/tauri.test.ts` (off-desktop no-op; the ingest→outbox mapping is unit-tested at the ingest level already)

**Interfaces:**
- `startBridgeWatch(onIngested)` → subscribes to `bridge://change`; per event: `const change = JSON.parse(payload); const result = await ingestAgentChange(change); await invoke('bridge_write_outbox', { id: change.id, contents: JSON.stringify(result) }); if (result.ok) onIngested?.();`. Returns an unlisten fn. No-op off desktop.
- `BridgeLifecycle.svelte`: `$effect` #1 exports on `agentData.version` (G7); `$effect` #2 starts the watch (desktop-only) and, after an ingested change, re-exports + calls `onAgentIngested` (the app refresh).

- [ ] Steps mirror the prior plan's Tasks 15/17 but keyed on the signal and writing the outbox. Off-desktop unit test asserts no-ops. Verify `pnpm test` green + no new svelte-check errors. Commit `feat(desktop): puente bidireccional del buzón cableado al ingest idempotente`.

> Manual desktop check (Hernan): with the app open, drop `inbox/<id>.json`; confirm the task applies, `outbox/<id>.json` appears with the result, the input moves to `processed/`, `export.json` refreshes, and a hidden-note target is rejected.

---

### Task M1: Scaffold the real MCP server (Node stdio)

**Files:**
- Create: `mcp/package.json`, `mcp/server.js`, `mcp/README.md`
- Create: `mcp/lib/mailbox.js` (read export.json; write inbox; poll outbox)
- Test: `mcp/lib/mailbox.test.js` (Vitest, node — uses a temp dir)

**Interfaces:**
- `mcp/` is a standalone Node package (not part of the SvelteKit build). Depends on `@modelcontextprotocol/sdk`. Reads the mailbox path from `process.env.CN_MAILBOX` (the app shows this path — Task M4).
- `mailbox.js`: `readExport()` → parsed `export.json` (or `{ notes: [] }` if absent); `submitChange(change)` → writes `inbox/<id>.json`, polls `outbox/<id>.json` up to a timeout (e.g. 10s), returns the parsed result (or a timeout error). `id` = `crypto.randomUUID()`.

**Build note:** the exact `@modelcontextprotocol/sdk` import paths + registration API change between versions. **Before writing `server.js`, verify the current API via context7** (`resolve-library-id` → `@modelcontextprotocol/sdk`, then `query-docs` for "stdio server registerTool registerResource"). The pattern below is the stable high-level shape; adjust names to the installed version.

- [ ] **Step 1: Write the failing mailbox test** (temp dir; write a fake export.json; assert readExport; write an outbox file and assert submitChange resolves it).
- [ ] **Step 2: Run → fail** (module missing).
- [ ] **Step 3: Implement `mailbox.js`** (fs + path; polling loop with a small sleep; atomic-ish read; ignore partial writes by retrying on JSON parse error).
- [ ] **Step 4: Scaffold `server.js`** (verify SDK API via context7 first):

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readExport, submitChange } from './lib/mailbox.js';

const server = new McpServer({ name: 'copynotes', version: '0.1.0' });
// resources + tools added in M2/M3
const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 5: Verify** `cd mcp && npm install && npm test` (mailbox test green). Commit `feat(mcp): servidor MCP stdio (scaffold + buzón client)`.

---

### Task M2: MCP resources — expose agent-visible tasks

**Files:** Modify `mcp/server.js`; test `mcp/lib/resources.test.js` (pure mapping from an export payload → MCP resource list).

**Interfaces:**
- A resource per agent-visible note (e.g. `copynotes://note/<id>`) whose content is that note's tasks (id, content, checked, and a short bitácora tail). A pure `notesToResources(export)` function is unit-tested; `server.js` wires it via the SDK's resource registration (verify API).

- [ ] TDD the pure `notesToResources` mapping; wire into `server.js`; commit `feat(mcp): recursos = tareas visibles para agentes`.

---

### Task M3: MCP tools — create_task / complete_task / add_note

**Files:** Modify `mcp/server.js`; test `mcp/lib/tools.test.js` (pure: tool args → change object; submitChange mocked).

**Interfaces:**
- Three tools with schemas: `create_task({ noteId, content })`, `complete_task({ blockId, summary? })`, `add_note({ blockId, text })`. Each builds a change `{ id, type, ... }` and calls `submitChange`; returns the result as MCP tool content (`{ content: [{ type: 'text', text: <human summary> }], isError: !result.ok }`).
- The MCP tools do NOT enforce privacy themselves — the APP's ingest gate is the authority (defense in depth stays server-side of the app). The tools just forward; a rejected change comes back as `isError`.

- [ ] TDD the pure arg→change builders (mock submitChange); wire tools into `server.js` (verify SDK `registerTool` signature); commit `feat(mcp): herramientas create/complete/add_note sobre el buzón`.

---

### Task M4: Client config + mailbox path in Settings + user guide

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte` (show the mailbox path — via `getMailboxPath()` on desktop — and a copy-paste MCP config snippet)
- Create/modify: `mcp/README.md`, `docs/guia/17-agentes.md`
- Test: e2e optional (desktop-only path display); at least the guide + README.

**Interfaces:**
- Settings > Agentes shows (desktop only): "Carpeta del buzón: <path>" and the exact JSON to paste into Claude Desktop / OpenCode MCP config, e.g.:

```json
{
  "mcpServers": {
    "copynotes": {
      "command": "node",
      "args": ["<repo>/mcp/server.js"],
      "env": { "CN_MAILBOX": "<mailbox path>" }
    }
  }
}
```

- The guide explains, in plain Spanish: install/connect steps, that CopyNotes must be open, what the agent can do, and the Rehacer flow.

- [ ] Show the path + snippet (desktop-gated); write README + guide; update the index date; commit `feat(mcp): configuración del cliente + ruta del buzón en Ajustes + guía`.

---

### Milestone S (LAST, APPROVAL GATE) — Single door: route Editor + Agenda through the task-action layer

> **DO NOT START without Hernan's explicit go.** This touches the stable editor (create/toggle/edit todo, Agenda toggle) — the highest-risk change. The beta's value question does not require it; it is for spec-purity (spec 028:118) and cloud/audit completeness. When approved, do it in small, individually-tested slices, each behind full e2e for the editor's todo flows, and re-verify the whole editor suite after each slice.

### Task S1 (only after approval): route the editor's todo create/toggle/edit + Agenda toggle through `$lib/tasks`

**Files:** `src/lib/editor/Editor.svelte`, `src/lib/components/AgendaPanel.svelte`, storage/editor tests + e2e.

**Approach:** replace direct `createBlock({type:'todo'})` / `updateBlock({checked})` / todo text edits with `createTask` / `completeTask` / `reopenTask` / `editTask` so user actions also leave one bitácora entry, atomically. Preserve the editor's cascade (parent/child) and history/snapshot behavior — the task-action layer must be extended to accept the cascade updates OR the editor keeps the cascade and calls the layer per affected block. This is design-heavy; brainstorm the cascade↔layer boundary before coding. Full editor + agenda e2e must stay green.

---

## Self-Review

**Spec/finding coverage:**

| Review finding | Task |
|---|---|
| #1 export trigger wrong (privacy) | G7 |
| #2 task+activity not atomic | G1 |
| #3 single door not real | S1 (gated) |
| #4 backups drop/leak activity | G6 |
| #5 actor spoofing / agents repo dead | G3 |
| #6 target not validated as todo / no field validation / no idempotency | G4 (todo+fields), P1 (idempotency) |
| #7 same-ms ordering, test hides it | G2 |
| #8 Rehacer doesn't refresh editor / e2e weak | G5 |
| Real MCP server (Hernan's decision) | M1–M4 |
| Buzón as data plane / RPC | P1–P3 |
| buildAgentExport race | note in G7 (read within the export build; acceptable) — harden in P3 if needed |
| tmp-file uniqueness | subsumed by outbox per-id files (P2) |
| flat task hierarchy | deferred (M2 can carry order/parent later; note for a follow-up) |
| toggle a11y / desktop-only visibility | follow-up polish (not blocking; decide during M4) |

**Placeholder scan:** MCP `server.js` SDK wiring is intentionally marked "verify current API via context7 before writing" — the surrounding logic (mailbox client, pure mappers, tools' arg→change) is fully specified and testable without the SDK. Rust P2 reuses the prior plan's verified watcher code. e2e note-selection in G5 has an adapt-if-needed clause.

**Ordering/consistency:** G1's `traceWrite` shape is reused by G2 (seq inside the same transaction), G3 (actor param), G7 (bump on success). Change shape (`{id,type,noteId,blockId,content,text}`, no `agentId`) is consistent across P1 (ingest), P3 (watch), M3 (tools).

---

## Execution Handoff

Save location: `docs/superpowers/plans/2026-07-23-mcp-real-y-cimientos.md`. Execute with superpowers:subagent-driven-development (fresh subagent per task, review between), tracking `.superpowers/sdd/progress.md`. Recommended order G → P → M → (approval) → S. The plan + ledger are durable across session close.
