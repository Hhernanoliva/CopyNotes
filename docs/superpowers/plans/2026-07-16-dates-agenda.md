# Block Dates & Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **✅ Plan COMPLETADO.** Las funciones se entregaron y están en producción. Las casillas `- [ ]` quedan como registro histórico del plan, no como trabajo pendiente.

**Goal:** `/fecha` puts a date badge on any block; a new Agenda sidebar view lists every dated block grouped by day (spec `specs/021-dates-agenda.md`).

**Architecture:** A new optional block field `dueDate` (`'YYYY-MM-DD'` local day string). All pure date logic lives in a new `src/lib/dates/` module (node-tested, no DOM). Storage indexes `dueDate` (Dexie v4); the ingest gate, backup schema (v3), clipboard/snippet carriers and copy/export formatters each learn the field. UI: slash entry + `DatePanel` + badge in `BlockRow` (Slice A), then `AgendaPanel` as a fourth sidebar view (Slice B).

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie, Valibot, Vitest (projects: `server` = node, `jsdom`), Playwright.

## Global Constraints

- Hand-written code is plain JavaScript inside `.ts`/`.svelte` — no type annotations (project CLAUDE.md).
- UI copy in Spanish; match existing Quiet Ink token classes (`bg-popover`, `text-muted-foreground`, `text-destructive`…), never raw colors.
- **Never `new Date('YYYY-MM-DD')`** — parses as UTC, shifts the day in UTC-negative timezones. Build via `new Date(y, m - 1, d)`; compare day strings lexicographically.
- Structural block changes (set/remove `dueDate`, toggle checked) persist **immediately** via `updateBlock`, never debounced.
- `src/lib/copy/` and `src/lib/export-import/` tests run in node — they must not import DOM-touching modules (`format/ingest.ts`, `format/sanitize.ts`). `src/lib/dates/` must stay pure so both sides can import it.
- Every user-visible change updates `docs/guia/` **in the same commit** (plain Spanish), plus the "Última actualización" date in `docs/guia-de-uso.md`.
- Commits: Conventional Commits, terse, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- After each task: run the named tests; at the end of each slice run `npx vitest run` and `npx svelte-check`.

---

### Task 1: Pure date helpers — `src/lib/dates/`

**Files:**
- Create: `src/lib/dates/core.ts`
- Create: `src/lib/dates/index.ts`
- Test: `src/lib/dates/core.test.ts` (runs in the `server` vitest project automatically)

**Interfaces (Produces):**
- `isValidDueDate(value)` → boolean (`'YYYY-MM-DD'`, real calendar day)
- `todayString(now = new Date())` → local `'YYYY-MM-DD'`
- `addDays(day, count)` → day string
- `resolveQuickOption(option, today)` — `'today' | 'tomorrow' | 'next-week'` → day string
- `badgeLabel(day, today)` → `'hoy' | 'mañana' | '22 jul' | '22 jul 2027'`
- `exportLabel(day)` → `'22/07/2026'`
- `dateSuffix(block)` → `' — 📅 22/07/2026'` or `''`
- `isOverdue(block, today)` → boolean (past date, and not a checked todo)

- [ ] **Step 1: Write the failing tests**

`src/lib/dates/core.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import {
	addDays,
	badgeLabel,
	dateSuffix,
	exportLabel,
	isOverdue,
	isValidDueDate,
	resolveQuickOption,
	todayString
} from './core';

describe('isValidDueDate', () => {
	it('accepts a real calendar day', () => {
		expect(isValidDueDate('2026-07-22')).toBe(true);
	});
	it('rejects wrong shapes and impossible days', () => {
		expect(isValidDueDate('22/07/2026')).toBe(false);
		expect(isValidDueDate('2026-02-30')).toBe(false);
		expect(isValidDueDate('2026-7-2')).toBe(false);
		expect(isValidDueDate(20260722)).toBe(false);
		expect(isValidDueDate(null)).toBe(false);
	});
});

describe('todayString', () => {
	it('formats the local day, zero-padded', () => {
		expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('addDays', () => {
	it('crosses month and year boundaries', () => {
		expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});
});

describe('resolveQuickOption', () => {
	it('maps the three quick options', () => {
		expect(resolveQuickOption('today', '2026-07-16')).toBe('2026-07-16');
		expect(resolveQuickOption('tomorrow', '2026-07-16')).toBe('2026-07-17');
		expect(resolveQuickOption('next-week', '2026-07-16')).toBe('2026-07-23');
	});
});

describe('badgeLabel', () => {
	it('uses relative words for today and tomorrow', () => {
		expect(badgeLabel('2026-07-16', '2026-07-16')).toBe('hoy');
		expect(badgeLabel('2026-07-17', '2026-07-16')).toBe('mañana');
	});
	it('shows day and short month within the current year', () => {
		expect(badgeLabel('2026-07-22', '2026-07-16')).toMatch(/22.*jul/i);
		expect(badgeLabel('2026-07-22', '2026-07-16')).not.toMatch(/2026/);
	});
	it('adds the year when it differs', () => {
		expect(badgeLabel('2027-07-22', '2026-07-16')).toMatch(/2027/);
	});
});

describe('exportLabel / dateSuffix', () => {
	it('formats DD/MM/YYYY', () => {
		expect(exportLabel('2026-07-22')).toBe('22/07/2026');
	});
	it('builds the export suffix only for dated blocks', () => {
		expect(dateSuffix({ dueDate: '2026-07-22' })).toBe(' — 📅 22/07/2026');
		expect(dateSuffix({})).toBe('');
		expect(dateSuffix({ dueDate: 'nope' })).toBe('');
	});
});

describe('isOverdue', () => {
	it('flags past dates', () => {
		expect(isOverdue({ type: 'text', dueDate: '2026-07-10' }, '2026-07-16')).toBe(true);
		expect(isOverdue({ type: 'text', dueDate: '2026-07-16' }, '2026-07-16')).toBe(false);
	});
	it('a checked todo is never overdue', () => {
		expect(isOverdue({ type: 'todo', checked: true, dueDate: '2026-07-10' }, '2026-07-16')).toBe(false);
		expect(isOverdue({ type: 'todo', checked: false, dueDate: '2026-07-10' }, '2026-07-16')).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/dates/core.test.ts`
Expected: FAIL — cannot resolve `./core`.

- [ ] **Step 3: Implement `src/lib/dates/core.ts`**

```js
// Block dates (spec 021). A dueDate is always a LOCAL 'YYYY-MM-DD' string.
// NEVER new Date('YYYY-MM-DD') — JS parses that as UTC and the day shifts
// west of Greenwich. Parse digits, build Date only via new Date(y, m-1, d),
// compare day strings lexicographically (the format sorts naturally).
// Pure module: no DOM, no storage — safe to import from copy/, export-import/
// and format/ alike.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(day) {
	const match = DAY_RE.exec(day);
	if (!match) return null;
	const [, y, m, d] = match;
	return { y: Number(y), m: Number(m), d: Number(d) };
}

export function isValidDueDate(value) {
	if (typeof value !== 'string') return false;
	const p = parts(value);
	if (!p) return false;
	const date = new Date(p.y, p.m - 1, p.d);
	return date.getFullYear() === p.y && date.getMonth() === p.m - 1 && date.getDate() === p.d;
}

function toDayString(date) {
	const pad = (value) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayString(now = new Date()) {
	return toDayString(now);
}

function toLocalDate(day) {
	const p = parts(day);
	return new Date(p.y, p.m - 1, p.d);
}

export function addDays(day, count) {
	const date = toLocalDate(day);
	date.setDate(date.getDate() + count);
	return toDayString(date);
}

export function resolveQuickOption(option, today) {
	if (option === 'today') return today;
	if (option === 'tomorrow') return addDays(today, 1);
	if (option === 'next-week') return addDays(today, 7);
	return null;
}

const shortDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const shortDayYear = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

export function badgeLabel(day, today) {
	if (day === today) return 'hoy';
	if (day === addDays(today, 1)) return 'mañana';
	const format = day.slice(0, 4) === today.slice(0, 4) ? shortDay : shortDayYear;
	return format.format(toLocalDate(day)).replaceAll('.', '');
}

export function exportLabel(day) {
	const p = parts(day);
	const pad = (value) => String(value).padStart(2, '0');
	return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

// What copy/export appends to a dated line so dates never vanish silently.
export function dateSuffix(block) {
	return isValidDueDate(block?.dueDate) ? ` — 📅 ${exportLabel(block.dueDate)}` : '';
}

export function isOverdue(block, today) {
	if (!isValidDueDate(block?.dueDate)) return false;
	if (block.type === 'todo' && block.checked) return false;
	return block.dueDate < today;
}
```

`src/lib/dates/index.ts`:

```js
export {
	addDays,
	badgeLabel,
	dateSuffix,
	exportLabel,
	isOverdue,
	isValidDueDate,
	resolveQuickOption,
	todayString
} from './core';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dates/core.test.ts`
Expected: PASS. If the `badgeLabel` month assertions fail on ICU formatting, loosen the regex (e.g. `/jul/i`) — never hard-code a full locale string.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates/
git commit -m "feat(dates): pure day-string helpers for block dates"
```

---

### Task 2: Storage — Dexie v4 index, `createBlock`, `listDatedBlocks`

**Files:**
- Modify: `src/lib/storage/db.ts` (after the `db.version(3)` block, line 43)
- Modify: `src/lib/storage/blocks.ts` (`createBlock` lines 7–43; new query at end)
- Modify: `src/lib/storage/index.ts` (export `listDatedBlocks`)
- Test: `src/lib/storage/blocks.test.ts` (append; copy the file's existing setup — it already runs Dexie in the node project)

**Interfaces:**
- Consumes: nothing new.
- Produces: `listDatedBlocks()` → Promise of live blocks having a `dueDate`, ascending by date. `createBlock(fields)` accepts optional `dueDate` (defaults `null`).

- [ ] **Step 1: Write the failing tests** — append to `src/lib/storage/blocks.test.ts`, reusing its existing describe/setup style:

```js
describe('dueDate (spec 021)', () => {
	it('createBlock stores dueDate and defaults it to null', async () => {
		const note = await createNote({ title: 'Agenda' });
		const dated = await createBlock({ noteId: note.id, content: 'a', dueDate: '2026-07-22' });
		const plain = await createBlock({ noteId: note.id, content: 'b' });
		expect(dated.dueDate).toBe('2026-07-22');
		expect(plain.dueDate).toBeNull();
	});

	it('listDatedBlocks returns live dated blocks ascending, skipping deleted and undated', async () => {
		const note = await createNote({ title: 'Agenda' });
		const late = await createBlock({ noteId: note.id, content: 'late', dueDate: '2026-08-01' });
		const early = await createBlock({ noteId: note.id, content: 'early', dueDate: '2026-07-01' });
		await createBlock({ noteId: note.id, content: 'undated' });
		const gone = await createBlock({ noteId: note.id, content: 'gone', dueDate: '2026-07-15' });
		await softDeleteBlock(gone.id);
		const rows = await listDatedBlocks();
		expect(rows.map((row) => row.id)).toEqual([early.id, late.id]);
	});

	it('clearing dueDate removes the block from the dated index', async () => {
		const note = await createNote({ title: 'Agenda' });
		const block = await createBlock({ noteId: note.id, content: 'x', dueDate: '2026-07-22' });
		await updateBlock(block.id, { dueDate: null });
		const rows = await listDatedBlocks();
		expect(rows.find((row) => row.id === block.id)).toBeUndefined();
	});
});
```

Import `listDatedBlocks` (and whatever of `createNote`/`softDeleteBlock`/`updateBlock` is not yet imported) at the top of the test file, following its existing imports.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/blocks.test.ts`
Expected: FAIL — `listDatedBlocks` not exported / `dueDate` undefined instead of null.

- [ ] **Step 3: Implement**

`src/lib/storage/db.ts` — append after the version(3) block:

```js
// v4 (spec 021): index dueDate so the Agenda lists dated blocks without a
// table scan. No upgrade body: blocks without a dueDate (or with null, not a
// valid IndexedDB key) simply stay out of the index.
db.version(4).stores({
	blocks: 'id, noteId, parentBlockId, dueDate'
});
```

`src/lib/storage/blocks.ts` — in `createBlock`, add `dueDate = null` to the destructuring (after `note = ''`) and `dueDate,` to the block object (after `note,`). At the end of the file:

```js
// Every live block carrying a dueDate, ascending by date — the Agenda query.
// orderBy walks the dueDate index, so undated/null rows never appear.
export async function listDatedBlocks() {
	return db.table('blocks').orderBy('dueDate').filter((block) => !block.deletedAt).toArray();
}
```

(Use the module's existing `blocks` table constant instead of `db.table('blocks')` — it is already in scope.)

Export `listDatedBlocks` from `src/lib/storage/index.ts` alongside the other block functions.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/storage/blocks.test.ts`
Expected: PASS, including all pre-existing tests (the v4 schema must not break them).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/
git commit -m "feat(storage): dueDate block field with Dexie v4 index"
```

---

### Task 3: Ingest gate + backup schema v3 + spec 018

**Files:**
- Modify: `src/lib/format/ingest.ts:14-28` (`normalizeNode`)
- Modify: `src/lib/export-import/schema.ts` (versions lines 10–13; `blockSchema` line 26; `snapshotNodeSchema` line 47)
- Modify: `specs/018-backup-json-format.md` (Block optional fields)
- Test: `src/lib/format/ingest.test.ts`, `src/lib/export-import/schema.test.ts` (append, following each file's existing fixtures/helpers)

**Interfaces:**
- Consumes: `isValidDueDate` from `$lib/dates` (Task 1).
- Produces: normalized nodes always carry `dueDate` (valid string or `null`); backups declare `formatVersion: 3`, accept 1–3.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format/ingest.test.ts` (jsdom project), reusing its node fixtures:

```js
describe('dueDate ingest (spec 021)', () => {
	it('keeps a valid dueDate', () => {
		const forest = normalizeForest([{ type: 'text', content: 'a', dueDate: '2026-07-22', children: [] }]);
		expect(forest[0].dueDate).toBe('2026-07-22');
	});
	it('drops malformed dueDate values', () => {
		for (const bad of ['22/07/2026', '2026-02-30', 42, {}, null]) {
			const forest = normalizeForest([{ type: 'text', content: 'a', dueDate: bad, children: [] }]);
			expect(forest[0].dueDate).toBeNull();
		}
	});
});
```

Append to `src/lib/export-import/schema.test.ts`, using its existing valid-backup fixture builder (grep the file for how it constructs a minimal valid backup and reuse that helper):

```js
describe('formatVersion 3 / dueDate (spec 021)', () => {
	it('accepts version 3 with and without dueDate', () => {
		const backup = validBackup(); // the file's existing fixture helper
		backup.formatVersion = 3;
		backup.data.blocks[0].dueDate = '2026-07-22';
		expect(validateBackup(backup).ok).toBe(true);
		delete backup.data.blocks[0].dueDate;
		expect(validateBackup(backup).ok).toBe(true);
	});
	it('rejects a malformed dueDate', () => {
		const backup = validBackup();
		backup.formatVersion = 3;
		backup.data.blocks[0].dueDate = '22/07/2026';
		expect(validateBackup(backup).ok).toBe(false);
	});
	it('still rejects unsupported future versions', () => {
		const backup = validBackup();
		backup.formatVersion = 4;
		expect(validateBackup(backup).ok).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/format/ingest.test.ts src/lib/export-import/schema.test.ts`
Expected: FAIL — `dueDate` is `undefined` after normalize; version 3 rejected.

- [ ] **Step 3: Implement**

`src/lib/format/ingest.ts`: add `import { isValidDueDate } from '$lib/dates';` and inside `normalizeNode`'s returned object (after `codeCollapsed`):

```js
			dueDate: isValidDueDate(raw.dueDate) ? raw.dueDate : null,
```

`src/lib/export-import/schema.ts`:

```js
// Version 2 added the heading block types; version 3 added the optional block
// dueDate. Shapes are otherwise identical, so 1 and 2 import with no migration.
export const SUPPORTED_VERSIONS = [1, 2, 3];
export const CURRENT_VERSION = 3;
```

In `blockSchema` (after `checked`) and in `snapshotNodeSchema` (after `codeCollapsed`), add the same line:

```js
	dueDate: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
```

`specs/018-backup-json-format.md`: in the Block section, add under Optional fields:

```markdown
- `dueDate` — optional `YYYY-MM-DD` date for the Agenda (spec 021). Missing
  or `null` means the block has no date. Added in `formatVersion` 3.
```

Also note version 3 wherever the spec mentions `formatVersion` values.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/format/ingest.test.ts src/lib/export-import/schema.test.ts src/lib/export-import/backup.test.ts src/lib/export-import/merge.test.ts`
Expected: PASS. If `backup.test.ts` asserts `formatVersion: 2` on export, update those assertions to 3 — that is the intended behavior change.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/ingest.ts src/lib/export-import/schema.ts src/lib/format/ingest.test.ts src/lib/export-import/*.test.ts specs/018-backup-json-format.md
git commit -m "feat(backup): dueDate through ingest gate, backup format v3"
```

---

### Task 4: Carriers — clipboard tree, snippet snapshot, snippet insertion

**Files:**
- Modify: `src/lib/copy/serialize.ts:16-27` (`treeToNode`)
- Modify: `src/lib/snippets/snapshot.ts` (`snapshotFromBlocks`'s inner `node()`)
- Modify: `src/lib/snippets/insert.ts:29-45` (`materialize`)
- Test: `src/lib/copy/serialize.test.ts`, `src/lib/snippets/snapshot.test.ts`, `src/lib/snippets/insert.test.ts` (append, following each file's fixtures)

**Interfaces:**
- Produces: clipboard nodes, snippet snapshots and materialized blocks all carry `dueDate` (`?? null`), exactly like `codeCollapsed` does. Undo/redo needs **no change** — `history.ts` snapshots and diffs whole rows.

- [ ] **Step 1: Write the failing tests** — one per file, shaped on each file's existing tests:

`serialize.test.ts`:

```js
it('treeToNode carries dueDate (spec 021)', () => {
	const tree = { block: { id: 'b1', type: 'text', content: 'a', dueDate: '2026-07-22' }, children: [] };
	expect(treeToNode(tree).dueDate).toBe('2026-07-22');
	const bare = { block: { id: 'b2', type: 'text', content: 'a' }, children: [] };
	expect(treeToNode(bare).dueDate).toBeNull();
});
```

`snapshot.test.ts` (use the file's existing block fixtures — the point is the returned node has the field):

```js
it('snapshotFromBlocks carries dueDate (spec 021)', () => {
	const blocks = [/* copy the minimal root-block fixture the file already uses, plus dueDate: '2026-07-22' on the root */];
	const snapshot = snapshotFromBlocks(blocks, blocks[0].id);
	expect(snapshot.dueDate).toBe('2026-07-22');
});
```

`insert.test.ts`:

```js
it('materialized snippet blocks carry dueDate (spec 021)', () => {
	const snippet = { blockSnapshot: { type: 'todo', content: 'pagar', dueDate: '2026-07-22', checked: false, children: [] } };
	const plan = planSnippetInsertion([], snippet, { noteId: 'n1', createId: () => 'x1' });
	expect(plan.newBlocks[0].dueDate).toBe('2026-07-22');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/copy/serialize.test.ts src/lib/snippets/`
Expected: FAIL — `dueDate` undefined in all three.

- [ ] **Step 3: Implement** — one line each, placed next to `checked`/`codeCollapsed`:

- `serialize.ts` `treeToNode`: `dueDate: tree.block.dueDate ?? null,`
- `snapshot.ts` inner `node()`: `dueDate: block.dueDate ?? null,`
- `insert.ts` `materialize` pushed object: `dueDate: node.dueDate ?? null,`

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/copy/serialize.test.ts src/lib/snippets/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/copy/serialize.ts src/lib/copy/serialize.test.ts src/lib/snippets/
git commit -m "feat(dates): carry dueDate through clipboard and snippet paths"
```

---

### Task 5: Copy & export emit the date as trailing text

**Files:**
- Modify: `src/lib/copy/format.ts` (`plainLines` lines 31–45, `htmlContent` lines 75–82)
- Modify: `src/lib/export-import/note-export.ts` (`markdownListLines` 48–63, `markdownRootChunk` 65–79, `htmlListItem` 124–135, `htmlRootChunk` 137–149)
- Test: `src/lib/copy/format.test.ts`, `src/lib/export-import/note-export.test.ts` (append)

**Interfaces:**
- Consumes: `dateSuffix(block)` and `exportLabel(day)` from `$lib/dates` (both pure — safe in these node-tested modules).
- Placement rule (all formats): the suffix lands at the end of the block's **last content line**, before the gray note and before children. **Code blocks are the exception** — appending to a code line would corrupt the code, so the date goes on its **own line after the code body/fence**, as `📅 22/07/2026` (no dash). Separators never have dates.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/copy/format.test.ts` (reuse its tree-building style):

```js
describe('date suffix (spec 021)', () => {
	const dated = (type, extra = {}) => ({
		block: { id: 'b1', type, content: 'pagar', checked: false, dueDate: '2026-07-22', ...extra },
		children: []
	});
	it('plain text appends the date to the last content line', () => {
		expect(formatPlainText(dated('todo'))).toBe('- [ ] pagar — 📅 22/07/2026');
	});
	it('plain text puts the date after soft-break lines, before the note', () => {
		const tree = dated('bullet', { content: 'uno\ndos', note: 'gris' });
		expect(formatPlainText(tree)).toBe('- uno\n  dos — 📅 22/07/2026\n  gris');
	});
	it('plain text gives code its own date line', () => {
		const tree = dated('code', { content: 'let a = 1;' });
		expect(formatPlainText(tree)).toBe('let a = 1;\n📅 22/07/2026');
	});
	it('html appends the date after the inline content', () => {
		expect(formatHtml(dated('text'))).toBe('<p>pagar — 📅 22/07/2026</p>');
	});
	it('undated blocks are untouched', () => {
		const tree = { block: { id: 'b1', type: 'text', content: 'pagar', checked: false }, children: [] };
		expect(formatPlainText(tree)).toBe('pagar');
	});
});
```

Note: `formatHtml` renders `block.html` when present — the dated fixtures above deliberately omit `html` so the escaped-content fallback makes assertions exact. Match the real `<p>` output of the current formatter; if the existing single-text-block output differs, mirror it.

Append to `src/lib/export-import/note-export.test.ts`:

```js
describe('date suffix (spec 021)', () => {
	const note = { title: 'Agenda' };
	it('markdown appends the date to list items and paragraphs', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'todo', content: 'pagar', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToMarkdown(note, blocks)).toContain('- [ ] pagar — 📅 22/07/2026');
	});
	it('markdown puts the code date after the closing fence', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'code', content: 'let a = 1;', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToMarkdown(note, blocks)).toContain('```\n📅 22/07/2026');
	});
	it('html export appends the date after the content', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'text', content: 'pagar', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToHtml(note, blocks)).toContain('pagar — 📅 22/07/2026');
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/copy/format.test.ts src/lib/export-import/note-export.test.ts`
Expected: FAIL — no suffix emitted.

- [ ] **Step 3: Implement**

`src/lib/copy/format.ts` — `import { dateSuffix, exportLabel, isValidDueDate } from '$lib/dates';`. In `plainLines`, after `lines` is computed and **before** the note concat:

```js
	if (isValidDueDate(block.dueDate)) {
		if (block.type === 'code') lines.push(indent + '📅 ' + exportLabel(block.dueDate));
		else lines[lines.length - 1] += dateSuffix(block);
	}
```

In `htmlContent` (and the lone-block branch of `formatHtml`), append `escapeHtml(dateSuffix(block))` right after the content part and before `noteHtml(block)`:

```js
function htmlContent(block) {
	if (block.type === 'separator') return '<hr>';
	const date = escapeHtml(dateSuffix(block));
	const level = HEADING_LEVELS[block.type];
	if (level) return `<h${level}>` + inlineHtml(block) + `</h${level}>` + date + noteHtml(block);
	if (block.type === 'code') return '<pre><code>' + escapeHtml(block.content) + '</code></pre>' + date + noteHtml(block);
	if (block.type === 'todo') return todoMark(block) + ' ' + inlineHtml(block) + date + noteHtml(block);
	return inlineHtml(block) + date + noteHtml(block);
}
```

And in `formatHtml`'s lone-text branch: `'<p>' + inlineHtml(block) + escapeHtml(dateSuffix(block)) + noteHtml(block) + '</p>'`.

`src/lib/export-import/note-export.ts` — same import. In `markdownListLines` and `markdownRootChunk`, after `lines` is computed and before `noteLines` concat:

```js
	if (isValidDueDate(block.dueDate)) {
		if (block.type === 'code') lines.push(indent + '📅 ' + exportLabel(block.dueDate));
		else lines[lines.length - 1] += dateSuffix(block);
	}
```

(`markdownRootChunk` has no `indent` variable — use `''`.) In `htmlListItem` and `htmlRootChunk`, append `escapeHtml(dateSuffix(block))` after the content/element expression and before `noteHtml(block)`, mirroring `format.ts`. DRY tip: both files already duplicate `escapeHtml`/`todoMark` by convention (node-tested copies) — follow that; do **not** import between them.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/copy/format.test.ts src/lib/export-import/note-export.test.ts`
Expected: PASS, including all pre-existing cases (undated blocks byte-identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copy/format.ts src/lib/copy/format.test.ts src/lib/export-import/note-export.ts src/lib/export-import/note-export.test.ts
git commit -m "feat(dates): copy and export emit block dates as trailing text"
```

---

### Task 6: Slice A UI — `/fecha`, DatePanel, badge, editor wiring

**Files:**
- Modify: `src/lib/editor/slash.ts:5-15` (+ `src/lib/editor/slash.test.ts`)
- Create: `src/lib/editor/DatePanel.svelte`
- Modify: `src/lib/editor/SlashMenu.svelte:21-28` (icon)
- Modify: `src/lib/editor/BlockRow.svelte` (props ~line 30-67; badge + panel markup near the tags block at line 530)
- Modify: `src/lib/editor/Editor.svelte` (`applySlashCommand` line 1122; new handlers; BlockRow props at line ~1252)
- Modify: `docs/guia/` — create `12-fechas-y-agenda.md`, update `docs/guia-de-uso.md` index + date
- Test: `src/lib/editor/slash.test.ts`, new `e2e/dates.spec.ts`

**Interfaces:**
- Consumes: `badgeLabel`, `isOverdue`, `resolveQuickOption`, `todayString` from `$lib/dates`; `updateBlock` (immediate persist).
- Produces (used by Slice B): a block with `dueDate` set renders a visible badge whose accessible name is `Cambiar fecha`; `DatePanel` props are `{ hasDate, onPick(day), onRemove, onClose }`.

- [ ] **Step 1: Failing unit test** — append to `src/lib/editor/slash.test.ts`:

```js
it('offers Fecha and finds it by keyword (spec 021)', () => {
	expect(SLASH_COMMANDS.some((command) => command.id === 'date')).toBe(true);
	expect(filterCommands('fech').map((command) => command.id)).toContain('date');
	expect(filterCommands('agenda').map((command) => command.id)).toContain('date');
});
```

Run: `npx vitest run src/lib/editor/slash.test.ts` → FAIL.

- [ ] **Step 2: Slash catalog + icon**

`slash.ts` — insert after the `todo` entry:

```js
	{ id: 'date', label: 'Fecha', keywords: ['fecha', 'date', 'agenda', 'hoy', 'vencimiento', 'recordatorio'] },
```

`SlashMenu.svelte` — add `CalendarDays` to the `@lucide/svelte` import and `date: CalendarDays,` to the `icons` map.

Run: `npx vitest run src/lib/editor/slash.test.ts` → PASS.

- [ ] **Step 3: DatePanel component**

`src/lib/editor/DatePanel.svelte` (styling mirrors `LinkEditorPopover.svelte`; keep it dumb — the editor owns state):

```svelte
<script>
	import { resolveQuickOption, todayString } from '$lib/dates';

	let { hasDate = false, onPick, onRemove, onClose } = $props();

	let firstEl = $state();
	$effect(() => { firstEl?.focus(); });

	function pickQuick(option) { onPick(resolveQuickOption(option, todayString())); }
	function keydown(e) {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
	}

	const restOptions = [
		['tomorrow', 'Mañana'],
		['next-week', 'Próxima semana']
	];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	role="dialog"
	aria-label="Fecha del renglón"
	onkeydown={keydown}
	onmousedown={(e) => e.stopPropagation()}
	class="bg-popover border-border flex w-56 flex-col gap-0.5 rounded-md border p-1 shadow-lg"
>
	<button
		bind:this={firstEl}
		type="button"
		onclick={() => pickQuick('today')}
		class="hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
	>Hoy</button>
	{#each restOptions as [option, label] (option)}
		<button
			type="button"
			onclick={() => pickQuick(option)}
			class="hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
		>{label}</button>
	{/each}
	<label class="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-sm">
		Elegir día
		<input
			type="date"
			aria-label="Elegir día"
			onchange={(e) => { if (e.currentTarget.value) onPick(e.currentTarget.value); }}
			class="bg-background text-foreground min-w-0 flex-1 rounded-sm px-1 text-sm outline-none"
		/>
	</label>
	{#if hasDate}
		<button
			type="button"
			onclick={onRemove}
			class="text-destructive hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
		>Quitar fecha</button>
	{/if}
</div>
```

- [ ] **Step 4: BlockRow badge + panel slot**

Props: add to the `$props()` destructuring: `datePanelOpen = false, onDateBadge, onDatePick, onDateRemove, onDatePanelClose`. Imports: `import DatePanel from './DatePanel.svelte';` and `import { badgeLabel, isOverdue, todayString } from '$lib/dates';`. Derived, next to the other derived values:

```js
	const today = todayString();
	const dueLabel = $derived(block.dueDate ? badgeLabel(block.dueDate, today) : '');
	const overdue = $derived(isOverdue(block, today));
```

Markup — insert **between** the content column's closing `{/if}` (line 528) and the tags `{#if tags.length > 0}` block (line 530):

```svelte
	{#if block.dueDate && block.type !== 'separator'}
		<button
			type="button"
			aria-label="Cambiar fecha"
			use:tooltip={'Cambiar o quitar fecha'}
			onmousedown={(event) => event.preventDefault()}
			onclick={() => onDateBadge(block)}
			class="{overdue ? 'text-destructive' : 'text-muted-foreground'} hover:text-foreground focus-visible:ring-ring flex h-7 shrink-0 items-center gap-1 self-center rounded-sm px-1.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
		>📅 {dueLabel}</button>
	{/if}
```

Panel — next to the SlashMenu block at line 580 (same absolute positioning wrapper the slash menu uses):

```svelte
	{#if datePanelOpen}
		<div class="absolute top-full left-8 z-10 mt-1">
			<DatePanel
				hasDate={!!block.dueDate}
				onPick={(day) => onDatePick(block, day)}
				onRemove={() => onDateRemove(block)}
				onClose={() => onDatePanelClose(block)}
			/>
		</div>
	{/if}
```

- [ ] **Step 5: Editor wiring**

`Editor.svelte` — state next to `slash` (line 84): `let datePanelFor = $state(null);`

In `applySlashCommand` (line 1122), insert a branch **before** the generic type-change tail (after the `snippet` branch at line 1138):

```js
		if (command.id === 'date') {
			slash = null;
			if (!row) return;
			// Strip the "/query" text; the block keeps its type — a date is a
			// field, not a block type.
			row.content = '';
			row.html = '';
			await updateBlock(row.id, { content: '', html: '' });
			datePanelFor = row.id;
			return;
		}
```

New handlers next to `applySlashCommand`:

```js
	async function handleDatePick(block, day) {
		datePanelFor = null;
		history.push(currentSnapshot());
		block.dueDate = day;
		// Structural change: persist immediately, never debounced.
		await updateBlock(block.id, { dueDate: day });
		focusBlockId = block.id;
	}

	async function handleDateRemove(block) {
		datePanelFor = null;
		history.push(currentSnapshot());
		block.dueDate = null;
		await updateBlock(block.id, { dueDate: null });
		focusBlockId = block.id;
	}
```

BlockRow instantiation (props block at line ~1252): add

```svelte
					datePanelOpen={datePanelFor === row.block.id}
					onDateBadge={(block) => (datePanelFor = datePanelFor === block.id ? null : block.id)}
					onDatePick={handleDatePick}
					onDateRemove={handleDateRemove}
					onDatePanelClose={() => (datePanelFor = null)}
```

Also close the panel when the block loses focus the way `slash` is cleared at line 615 (`if (slash?.blockId === block.id) slash = null;`): add `if (datePanelFor === block.id) datePanelFor = null;` in the same spot — but **not** while the panel itself has focus; check `event.relatedTarget` the way the slash/tag handlers there do (mirror the existing guard; if none exists for slash, skip this and rely on Escape/pick/outside-click via `onDatePanelClose`).

- [ ] **Step 6: e2e test** — create `e2e/dates.spec.ts`, copying the setup/probe helpers from `e2e/critical-flows.spec.ts` (fresh app per test, `page.on('console')` logging, ~150ms waits after focus moves):

```js
// Spec 021 Slice A: /fecha puts a badge on the line and it survives reload.
test('slash date assigns a persistent badge', async ({ page }) => {
	// 1. Boot the app, create a note, focus the first block (reuse helpers).
	// 2. Type "/fecha" → the slash menu shows "Fecha" → press Enter.
	// 3. The date panel opens → click "Hoy".
	await page.getByRole('button', { name: 'Hoy' }).click();
	// 4. Badge visible with accessible name "Cambiar fecha" and text "📅 hoy".
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/hoy/);
	// 5. Reload, wait for boot, badge still there.
	await page.reload();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveText(/hoy/);
	// 6. Click the badge → "Quitar fecha" → badge gone.
	await page.getByRole('button', { name: 'Cambiar fecha' }).click();
	await page.getByRole('button', { name: 'Quitar fecha' }).click();
	await expect(page.getByRole('button', { name: 'Cambiar fecha' })).toHaveCount(0);
});
```

(The commented steps are real code in the final test — lift the exact typing/boot helpers from the existing spec file; typing `/fecha` goes through the focused block surface like the existing slash-menu e2e does.)

Run: `npx playwright test e2e/dates.spec.ts` → PASS.

- [ ] **Step 7: User guide** — create `docs/guia/12-fechas-y-agenda.md` in plain Spanish: qué es `/fecha`, los atajos Hoy/Mañana/Próxima semana/Elegir día, cómo cambiar o quitar la fecha tocando la etiqueta, y que al copiar/exportar la fecha sale como texto al final del renglón. Add the entry to `docs/guia-de-uso.md` and update its "Última actualización".

- [ ] **Step 8: Slice A gate + commit**

Run: `npx vitest run` → all green. `npx svelte-check` → 0 errors, 0 warnings. `npx playwright test` → all green.

```bash
git add src/lib/editor/ docs/guia/ docs/guia-de-uso.md e2e/dates.spec.ts
git commit -m "feat(editor): /fecha assigns a due-date badge to a block"
```

---

### Task 7: Agenda grouping + hide-completed setting (Slice B logic)

**Files:**
- Create: `src/lib/dates/agenda.ts`; modify `src/lib/dates/index.ts` (re-export)
- Modify: `src/lib/storage/settings.ts` (+ export in `src/lib/storage/index.ts` if settings are re-exported individually there)
- Test: `src/lib/dates/agenda.test.ts`, `src/lib/storage/settings.test.ts` (append)

**Interfaces:**
- Produces: `groupForAgenda(blocks, today)` → array of `{ id, label, items }`, only non-empty groups, in order `overdue | today | tomorrow | week | later`; items ascending by `dueDate`. `getAgendaHideCompleted()` / `setAgendaHideCompleted(value)`.
- Semantics (from spec + design): `week` runs from the day after tomorrow through the next **Sunday** (inclusive). Past **checked todos** are finished history — they appear in **no** group. Checked todos dated today or later stay in their day group (the UI strikes them through).

- [ ] **Step 1: Failing tests** — `src/lib/dates/agenda.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { groupForAgenda } from './agenda';

// 2026-07-16 is a Thursday; the week ends Sunday 2026-07-19.
const TODAY = '2026-07-16';
const block = (id, dueDate, extra = {}) => ({ id, type: 'text', content: id, checked: false, dueDate, ...extra });

describe('groupForAgenda', () => {
	it('splits into the five groups, ascending inside each', () => {
		const groups = groupForAgenda(
			[
				block('later', '2026-07-25'),
				block('today', '2026-07-16'),
				block('week2', '2026-07-19'),
				block('overdue', '2026-07-10'),
				block('week1', '2026-07-18'),
				block('tomorrow', '2026-07-17')
			],
			TODAY
		);
		expect(groups.map((group) => group.id)).toEqual(['overdue', 'today', 'tomorrow', 'week', 'later']);
		expect(groups.find((group) => group.id === 'week').items.map((item) => item.id)).toEqual(['week1', 'week2']);
	});
	it('monday after the weekend is "later"', () => {
		const groups = groupForAgenda([block('monday', '2026-07-20')], TODAY);
		expect(groups.map((group) => group.id)).toEqual(['later']);
	});
	it('drops empty groups and ignores undated blocks', () => {
		const groups = groupForAgenda([block('today', '2026-07-16'), block('none', null)], TODAY);
		expect(groups.map((group) => group.id)).toEqual(['today']);
	});
	it('checked past todos leave the agenda; unchecked stay overdue', () => {
		const groups = groupForAgenda(
			[
				block('done', '2026-07-10', { type: 'todo', checked: true }),
				block('pending', '2026-07-10', { type: 'todo', checked: false })
			],
			TODAY
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe('overdue');
		expect(groups[0].items.map((item) => item.id)).toEqual(['pending']);
	});
	it('a checked todo dated today still shows under Hoy', () => {
		const groups = groupForAgenda([block('done-today', '2026-07-16', { type: 'todo', checked: true })], TODAY);
		expect(groups[0].id).toBe('today');
	});
	it('labels are the Spanish group names', () => {
		const groups = groupForAgenda([block('overdue', '2026-07-10')], TODAY);
		expect(groups[0].label).toBe('Vencidas');
	});
});
```

Append to `src/lib/storage/settings.test.ts` (mirror the file's existing get/set tests):

```js
it('agendaHideCompleted round-trips and defaults to false (spec 021)', async () => {
	expect(await getAgendaHideCompleted()).toBe(false);
	await setAgendaHideCompleted(true);
	expect(await getAgendaHideCompleted()).toBe(true);
});
```

Run: `npx vitest run src/lib/dates/agenda.test.ts src/lib/storage/settings.test.ts` → FAIL.

- [ ] **Step 2: Implement**

`src/lib/dates/agenda.ts`:

```js
// Agenda grouping (spec 021): every live block with a dueDate, in five fixed
// day groups. Pure — the UI feeds it blocks and today's local day string.

import { addDays, isValidDueDate } from './core';

export const AGENDA_GROUPS = [
	{ id: 'overdue', label: 'Vencidas' },
	{ id: 'today', label: 'Hoy' },
	{ id: 'tomorrow', label: 'Mañana' },
	{ id: 'week', label: 'Esta semana' },
	{ id: 'later', label: 'Más adelante' }
];

// "Esta semana" ends next Sunday (inclusive). getDay(): 0 = Sunday.
function weekEnd(today) {
	const [y, m, d] = today.split('-').map(Number);
	const dow = new Date(y, m - 1, d).getDay();
	return addDays(today, (7 - dow) % 7);
}

export function groupForAgenda(blocks, today) {
	const tomorrow = addDays(today, 1);
	const sunday = weekEnd(today);
	const items = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
	const dated = blocks
		.filter((block) => isValidDueDate(block.dueDate))
		.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
	for (const block of dated) {
		if (block.dueDate < today) {
			// A finished past todo is history, not a pending item.
			if (!(block.type === 'todo' && block.checked)) items.overdue.push(block);
		} else if (block.dueDate === today) items.today.push(block);
		else if (block.dueDate === tomorrow) items.tomorrow.push(block);
		else if (block.dueDate <= sunday) items.week.push(block);
		else items.later.push(block);
	}
	return AGENDA_GROUPS.map((group) => ({ ...group, items: items[group.id] })).filter(
		(group) => group.items.length > 0
	);
}
```

Re-export from `src/lib/dates/index.ts`: `export { AGENDA_GROUPS, groupForAgenda } from './agenda';`

`src/lib/storage/settings.ts` — append, following the file's pattern:

```js
// Agenda: whether completed todos are hidden from the list (spec 021).
export async function getAgendaHideCompleted() {
	return (await getSetting('agendaHideCompleted')) === true;
}

export function setAgendaHideCompleted(value) {
	return setSetting('agendaHideCompleted', value === true);
}
```

Export both from `src/lib/storage/index.ts` next to the other settings exports.

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/lib/dates/agenda.test.ts src/lib/storage/settings.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dates/ src/lib/storage/settings.ts src/lib/storage/settings.test.ts src/lib/storage/index.ts
git commit -m "feat(agenda): day grouping and hide-completed setting"
```

---

### Task 8: Slice B UI — AgendaPanel, sidebar tab, jump-to-block

**Files:**
- Create: `src/lib/components/AgendaPanel.svelte`
- Modify: `src/lib/components/NoteSidebar.svelte` (VIEWS list line 40–44; new-button handling lines 108–109 and 167–172; view branch at lines 178/220)
- Modify: `src/routes/+page.svelte` (pass agenda handlers; `pendingFocusBlockId`; Editor prop)
- Modify: `src/lib/editor/Editor.svelte` (accept `initialFocusBlockId`, honor it in the load effect at line ~201)
- Modify: `docs/guia/12-fechas-y-agenda.md` + `docs/guia-de-uso.md` date
- Test: extend `e2e/dates.spec.ts`

**Interfaces:**
- Consumes: `groupForAgenda`, `todayString`, `badgeLabel` (Task 7 / Task 1); `listDatedBlocks` (Task 2); `getAgendaHideCompleted`/`setAgendaHideCompleted` (Task 7); `updateBlock`, `listNotes` from `$lib/storage`.
- Produces: `AgendaPanel` props `{ onOpen(noteId, blockId), onDataChanged() }`. `Editor` gains optional prop `initialFocusBlockId = null`.

- [ ] **Step 1: AgendaPanel component** — `src/lib/components/AgendaPanel.svelte`. It loads its own data on mount; the sidebar remounts it on every tab switch, so it is always fresh:

```svelte
<script>
	import { badgeLabel, groupForAgenda, todayString } from '$lib/dates';
	import {
		getAgendaHideCompleted,
		listDatedBlocks,
		listNotes,
		setAgendaHideCompleted,
		updateBlock
	} from '$lib/storage';

	let { onOpen, onDataChanged } = $props();

	let groups = $state([]);
	let titles = $state({});
	let hideCompleted = $state(false);
	let loaded = $state(false);

	async function refresh() {
		const [blocks, notes, hide] = await Promise.all([
			listDatedBlocks(),
			listNotes(),
			getAgendaHideCompleted()
		]);
		titles = Object.fromEntries(notes.map((note) => [note.id, note.title]));
		groups = groupForAgenda(blocks, todayString());
		hideCompleted = hide;
		loaded = true;
	}

	$effect(() => {
		refresh();
	});

	async function toggleTodo(block) {
		await updateBlock(block.id, { checked: !block.checked });
		await refresh();
		onDataChanged();
	}

	async function toggleHideCompleted() {
		hideCompleted = !hideCompleted;
		await setAgendaHideCompleted(hideCompleted);
	}

	function visibleItems(group) {
		return hideCompleted
			? group.items.filter((item) => !(item.type === 'todo' && item.checked))
			: group.items;
	}

	function firstLine(block) {
		return (block.content ?? '').split('\n')[0] || 'Sin texto';
	}

	const hasItems = $derived(groups.some((group) => visibleItems(group).length > 0));
</script>

<div class="flex flex-col gap-2 px-2 py-2" aria-label="Agenda">
	{#if loaded && !hasItems}
		<p class="text-muted-foreground px-2 py-4 text-sm text-balance">
			Nada agendado. Escribí «/fecha» en cualquier renglón de una nota para ponerle fecha.
		</p>
	{:else if loaded}
		<label class="text-muted-foreground flex items-center gap-2 px-2 text-xs">
			<input type="checkbox" checked={hideCompleted} onchange={toggleHideCompleted} />
			Ocultar completadas
		</label>
		{#each groups as group (group.id)}
			{@const items = visibleItems(group)}
			{#if items.length > 0}
				<section aria-label={group.label}>
					<h3 class="{group.id === 'overdue' ? 'text-destructive' : 'text-muted-foreground'} px-2 pt-2 pb-1 text-xs font-bold tracking-wide uppercase">
						{group.label}
					</h3>
					<ul class="flex flex-col">
						{#each items as item (item.id)}
							<li class="flex items-center gap-2 px-2">
								{#if item.type === 'todo'}
									<input
										type="checkbox"
										checked={item.checked}
										aria-label={item.checked ? 'Desmarcar tarea' : 'Marcar tarea'}
										onchange={() => toggleTodo(item)}
									/>
								{/if}
								<button
									type="button"
									onclick={() => onOpen(item.noteId, item.id)}
									class="hover:bg-accent focus-visible:ring-ring flex min-w-0 flex-1 flex-col rounded-sm px-1 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-none"
								>
									<span class="truncate text-sm {item.type === 'todo' && item.checked ? 'text-muted-foreground line-through' : ''}">
										{firstLine(item)}
									</span>
									<span class="text-faint truncate text-xs">
										{titles[item.noteId] ?? 'Nota'} · 📅 {badgeLabel(item.dueDate, todayString())}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>
```

Style the checkboxes like the sidebar's existing controls (match classes used by NoteSidebar's rows; adjust to Quiet Ink tokens, keep the semantics above).

- [ ] **Step 2: Sidebar tab**

`NoteSidebar.svelte`:
- `import AgendaPanel from './AgendaPanel.svelte';`
- VIEWS: add `{ id: 'agenda', label: 'Agenda' }` after `snippets`.
- Props: add `onOpenBlock, onDataChanged` to the `$props()` destructuring.
- The "new" button (lines 108–109 / 167–172): when `view === 'agenda'` there is nothing to create — hide the button (`{#if view !== 'agenda'}` around it) rather than adding a dead handler.
- View branches (line 220 region): add

```svelte
		{:else if view === 'agenda'}
			<AgendaPanel onOpen={onOpenBlock} {onDataChanged} />
```

- [ ] **Step 3: Jump to block**

`src/routes/+page.svelte` — new state `let pendingFocusBlockId = $state(null);`, a cleared flag on plain note switches, and the agenda entry point (order matters: `selectNote` clears the flag, so set it after):

```js
	function selectNote(id) {
		pendingFocusBlockId = null;
		currentNoteId = id;
		setLastOpenedNoteId(id);
		if (!isDesktop()) sidebarOpen = false;
	}

	function openFromAgenda(noteId, blockId) {
		// Remount the editor even when the note is already open so the focus
		// request applies (the editor is keyed on noteId + dataVersion).
		dataVersion++;
		selectNote(noteId);
		pendingFocusBlockId = blockId;
	}
```

Pass to the sidebar: `onOpenBlock={openFromAgenda}` and `onDataChanged={handleDataChanged}` (the existing import-refresh handler at the `BackupDialog` line — reuse it; it already bumps `dataVersion`, so `toggleTodo` edits reach an open editor). Pass to the editor (line ~379): `initialFocusBlockId={pendingFocusBlockId}`.

`src/lib/editor/Editor.svelte`:
- Props (line 73): add `initialFocusBlockId = null` to the destructuring.
- In the note-load effect (after `note = loadedNote;` / blocks assignment near line 203), add:

```js
			if (initialFocusBlockId && loadedBlocks.some((block) => block.id === initialFocusBlockId)) {
				focusBlockId = initialFocusBlockId;
			}
```

Focusing via `focusBlockId` reuses the editor's existing focus pipeline (BlockRow's `focusBlockSurface`), and the browser scrolls the focused surface into view. `selectNote` clearing `pendingFocusBlockId` guarantees a later plain note switch never re-focuses a stale block.

- [ ] **Step 4: e2e** — extend `e2e/dates.spec.ts`:

```js
// Spec 021 Slice B: the Agenda lists dated blocks and jumps to them.
test('agenda lists dated todos, toggles and navigates', async ({ page }) => {
	// 1. Boot, create a note, make a todo block "pagar", give it /fecha → Hoy.
	// 2. Open the sidebar, click the "Agenda" tab.
	await page.getByRole('button', { name: 'Agenda' }).click();
	// 3. Group "Hoy" shows the item with its note title.
	await expect(page.getByRole('region', { name: 'Hoy' }).getByText('pagar')).toBeVisible();
	// 4. Click the item → the editor focuses that block (assert the focused
	//    block surface contains "pagar" via document.activeElement, after the
	//    suite's standard 150ms focus wait).
	// 5. Back in Agenda: check the todo's checkbox → item gets line-through;
	//    enable "Ocultar completadas" → item disappears.
});
```

(As in Task 6: commented steps become real code lifted from the suite's helpers. `<section aria-label>` maps to `getByRole('region')`.)

Run: `npx playwright test e2e/dates.spec.ts` → PASS.

- [ ] **Step 5: User guide** — extend `docs/guia/12-fechas-y-agenda.md` with the Agenda section: la pestaña Agenda en la barra lateral, los grupos (Vencidas en rojo, Hoy, Mañana, Esta semana, Más adelante), tocar un ítem te lleva al renglón, marcar tareas desde ahí, y el interruptor «Ocultar completadas». Update "Última actualización" in `docs/guia-de-uso.md`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/ src/routes/+page.svelte src/lib/editor/Editor.svelte e2e/dates.spec.ts docs/guia/
git commit -m "feat(agenda): sidebar agenda view grouped by day with jump-to-block"
```

---

### Task 9: Final verification gate

**Files:** none new.

- [ ] **Step 1:** `npx vitest run` → every project green.
- [ ] **Step 2:** `npx svelte-check` → 0 errors, 0 warnings.
- [ ] **Step 3:** `npx playwright test` → full e2e suite green (run twice; the suite has a history of surfacing real persistence bugs on repeat runs).
- [ ] **Step 4:** Manual smoke against the spec's acceptance criteria (`specs/021-dates-agenda.md`): backup export→import roundtrip keeps dates; internal copy/paste of a dated block keeps the date; external paste of a corrupted payload (`dueDate: "22/07/2026"`) stores no date.
- [ ] **Step 5:** Dexie upgrade check: verify a pre-021 database opens under v4 with blocks intact and the dueDate index queryable, following the scratchpad `verify-migration-v3.mjs` pattern (seed a raw IDB at the previous Dexie version from a `/favicon.svg` same-origin page, then boot the app). See memory note `copynotes-history-post-mvp` for the recipe.
- [ ] **Step 6:** Report to Hernan in plain Spanish (product outcome first). Do not push.
