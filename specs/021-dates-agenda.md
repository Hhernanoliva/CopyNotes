# 021 - Block Dates & Agenda

Approved by Hernan 2026-07-16 (design conversation). Builds in two independent
slices: **Slice A (dates)** then **Slice B (agenda)**. Each slice is usable on
its own.

## Objective

Let the user put a date on any line with the existing `/` menu, and see
everything that has a date in one Agenda screen, grouped by day.

Design decision (approved): the date is a **block field** (`dueDate`), shown as
a badge at the end of the line — not free text and not an inline chip. One date
per block. This keeps agenda queries reliable and indexed, and it is the
cheapest of the three flavors already mapped in the ingest-gate contract
(see `src/lib/format/ingest.ts` and Agent Map below).

## What Enters

### Slice A — Dates

- New `/` menu entry **Fecha** (`id: 'date'`) in `SLASH_COMMANDS`
  (`src/lib/editor/slash.ts`). Keywords: `fecha`, `date`, `agenda`, `hoy`,
  `recordatorio`, `vencimiento`.
- Picking it opens a small date panel with quick options:
  **Hoy · Mañana · Próxima semana · Elegir día** (day picker; a native
  `<input type="date">` is acceptable — keep it cheap).
- The block gets `dueDate` and shows a badge at the end of the line:
  `📅 hoy`, `📅 mañana`, `📅 22 jul`, `📅 22 jul 2027` (year only when not the
  current year). Overdue badges (date < today, and block is not a checked todo)
  render in the destructive/danger tone.
- Clicking the badge reopens the same panel plus a **Quitar fecha** action.
- Works on every block type except `separator`.
- `dueDate` survives everything the block survives: IndexedDB persistence,
  undo/redo, internal copy/paste, snippet snapshots, JSON backup
  export/import, and note duplication if/when it exists.
- External copy and export (plain text, Markdown, HTML) append the date at the
  end of the line as readable text: ` — 📅 22/07/2026`. Dates must not vanish
  silently when content leaves the app.

### Slice B — Agenda

- New **Agenda** section in the main navigation, next to Notas and Snippets.
- Lists every non-deleted block with a `dueDate`, grouped in this order:
  1. **Vencidas** (date < today; excludes checked todos) — danger tone, top.
  2. **Hoy**
  3. **Mañana**
  4. **Esta semana** (day after tomorrow → the current week's Sunday, local
     time; empty on weekends by design — next week's days belong to Más
     adelante, decided 2026-07-16)
  5. **Más adelante** (everything after, ascending)
- Each item shows: block text (plain `content`, first line is enough), the
  todo checkbox when the block is a todo, and the source note title.
- Clicking an item opens the note and scrolls to / highlights that block.
- Todos can be toggled done/undone directly from the Agenda. Checked todos
  render struck through; a visible control hides/shows completed items
  (persisted as a setting, e.g. `agendaHideCompleted`).
- A block leaves **Vencidas** when it is checked, re-dated, or its date is
  removed.
- Empty state in plain Spanish explaining how to add dates with `/fecha`.

## What Does Not Enter (deliberate, do not sneak in)

- Notifications / reminders of any kind.
- Time of day (dates only, no hours).
- Recurring dates.
- More than one date per block.
- Inline date chips inside text (flavor 3 in the ingest contract — future).
- A month-grid calendar view (Agenda is a grouped list).
- Date ranges (start–end).

## Model of Data Affected

New **optional** block field:

```json
{ "dueDate": "2026-07-22" }
```

- Format: `YYYY-MM-DD` string, local calendar day, **no time, no timezone**.
- Absent / `null` / invalid ⇒ block has no date. Never a `Date` object in
  storage.
- Dexie: bump schema version, add `dueDate` to the blocks store indexes so the
  Agenda can query without scanning. No data migration needed (field optional).
- Backup (spec 018): `dueDate` joins the Block optional fields;
  `formatVersion` bumps to 3, `SUPPORTED_VERSIONS = [1, 2, 3]`, no migration
  (older backups simply have no dates). Update spec 018's Block section in the
  same commit that changes the schema.
- Snippets `blockSnapshot` carries `dueDate` like any other block field.
- Snippets-export format: unchanged (content-only, stays v1).

## User Flows

1. **Add a date**: type `/` on a line → choose Fecha → choose Hoy → badge
   `📅 hoy` appears at the end of the line.
2. **Change / remove**: click the badge → pick another day or Quitar fecha.
3. **Review the week**: open Agenda → see Vencidas first, then Hoy, Mañana,
   Esta semana, Más adelante → click an item → land on that line in its note.
4. **Work from the Agenda**: check a todo directly in the Agenda → it gets
   struck through everywhere; hide completed with the toggle.
5. **Backup roundtrip**: export backup → import on empty DB → dates and the
   Agenda look identical.

## Acceptance Criteria

- `/fecha` assigns a date on text, heading, bullet, todo and code blocks; not
  on separators.
- Badge shows relative labels (hoy/mañana) and short dates; overdue unchecked
  items look distinct.
- One date per block; setting a new date replaces the old one.
- `dueDate` survives: reload, undo/redo, internal copy/paste, snippet
  materialize, backup export→import (merge and replace-all), Dexie upgrade
  from a pre-021 database.
- External copy/export includes the date as trailing text in all three
  formats.
- Agenda groups exactly as specified, ascending within groups; checked todos
  excluded from Vencidas; hide-completed persists across sessions.
- Agenda item click focuses the right block in the right note.
- Pasting foreign/corrupted internal-clipboard data with a malformed `dueDate`
  stores no date (ingest gate drops it).

## Minimum Tests

- `slash.ts`: Fecha appears, filters by `fecha`/`hoy`/`agenda`.
- `src/lib/dates/` pure helpers: quick-option resolution (hoy/mañana/próxima
  semana), badge label formatting (relative, short, with year), agenda
  grouping around week boundaries, string-vs-today comparison (no `Date`
  parsing of `YYYY-MM-DD` — see Agent Map).
- Ingest gate: valid `dueDate` passes, malformed (`"22/07/2026"`, number,
  object) is dropped; backup validator accepts v3 with/without `dueDate`,
  rejects malformed.
- Copy/export: date suffix in plain, Markdown, HTML for dated blocks; absent
  for undated.
- Storage: Dexie upgrade test (pre-021 seed → new version → blocks intact,
  index queryable) following the `verify-migration-v3.mjs` scratchpad pattern.
- e2e: add date via `/fecha` → badge visible → reload → still there → Agenda
  shows it under the right group → click navigates → toggle todo from Agenda.

## Agent Map (read this before touching dates/agenda)

Purpose: future agents should not re-derive this area. Everything
date-related that is pure logic lives in **`src/lib/dates/`** (create it in
Slice A); UI stays thin on top of it.

| Concern | Where |
| --- | --- |
| Date math, labels, agenda grouping, today-comparison | `src/lib/dates/` (pure, node-tested, no DOM) |
| `/` menu entry | `src/lib/editor/slash.ts` |
| Badge + date panel UI | editor components (`BlockRow` area), thin — logic imported from `src/lib/dates/` |
| Field ingest on paste/backup/snapshot | `src/lib/format/ingest.ts` → `normalizeNode` builds nodes field-by-field and **drops unknown/invalid fields** — `dueDate` must be explicitly accepted there |
| Backup schema + versions | `src/lib/export-import/schema.ts` (+ spec 018) |
| Copy/export date suffix | `src/lib/copy/` + `src/lib/export-import/` (node-tested — never import DOM-touching modules like `ingest.ts` from there) |
| Agenda query | Dexie `dueDate` index via `src/lib/storage/` |

Hard-won rules that apply here:

- **Never `new Date('YYYY-MM-DD')`** for day logic — JS parses it as UTC and
  the day shifts in negative-offset timezones. Compare day strings against a
  local-today helper in `src/lib/dates/`; construct dates only via
  `new Date(y, m - 1, d)`.
- Structural changes (setting/removing `dueDate`) persist **immediately**
  through storage with the journal argument — never debounced (see
  persistence model: IDB writes die on unload; localStorage journal covers
  the gap).
- Undo/redo snapshots (`src/lib/editor/history.ts`) and
  `treeToNode`/snippet materialize copy blocks field-by-field in places —
  verify `dueDate` rides along everywhere `codeCollapsed` does (same class of
  field; `codeCollapsed` is the precedent to grep for).

### Checklist: adding another block field later (what `dueDate` walks through)

1. Storage: Dexie version bump (+ index only if queried).
2. Ingest gate: accept + validate the field in `normalizeNode`
   (`src/lib/format/ingest.ts`).
3. Backup: optional field in `schema.ts`, `formatVersion` bump, spec 018
   update.
4. Carriers: `treeToNode`, snippet snapshot/materialize, undo/redo history.
5. Outputs: copy formatters + export (decide explicitly whether the field is
   visible outside; silence is a bug).
6. UI + `docs/guia/` topic file in the implementing commit.

### Prepared extension points (do not build now)

- **Reminders/notifications**: purely additive — read the same `dueDate`
  index; needs Notification permission + a check-on-open or service-worker
  tick. No schema change.
- **Time of day**: extend `dueDate` to `YYYY-MM-DDTHH:mm` **behind a new
  optional field** (`dueTime`) instead of widening `dueDate`, so sorting and
  the day-grouping logic stay untouched.
- **Recurrence**: new optional field (e.g. `repeat`), walks the checklist
  above; agenda grouping in `src/lib/dates/` is the only logic that must
  learn to expand occurrences.
- **Inline date chips**: flavor 3 of the ingest contract — full 4-step
  allow-list procedure documented in `src/lib/format/sanitize.ts`. Orthogonal
  to `dueDate`; do not convert one into the other implicitly.

## Agent Notes

- Read `specs/018-backup-json-format.md` before touching backup, and the
  contract comment in `src/lib/format/sanitize.ts` before touching ingest.
- Agenda is a read view over blocks — it owns **no data** of its own except
  the `agendaHideCompleted` setting. If the Agenda ever needs to "remember"
  something per item, that belongs on the block, walking the field checklist.
- User guide: Slice A and Slice B each add/update a topic file in
  `docs/guia/` in the same commit (plain Spanish, per project rule).
