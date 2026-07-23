# 027 - Configuración + Tamaño de texto

Created: 2026-07-23. Approved by Hernan 2026-07-23 (design reviewed in chat:
solo escala el texto de la nota, botones A−/A+, diálogo estilo Ayuda/Respaldo,
más Quiet Motion).

## Objective

Add a **Configuración** dialog opened from a gear (⚙️) button in the top bar,
and give it a first section: **Tamaño de texto**. The user presses **A−** / **A+**
to shrink or enlarge the **note text only**; the choice is saved and survives
reloads, note switches, and rides along in backups. The dialog is architected as
the future home for more settings (MCP, sync) without a redesign — but only the
text-size section is built now (YAGNI).

## What enters

- A **gear button** in the top-bar right cluster, next to Ayuda and the
  sun/moon theme toggle. Same visual/interaction pattern as its siblings
  (`size-(--touch-target)`, hover `bg-accent`, `active:translate-y-px`).
  Lucide `Settings` icon. `aria-label` + tooltip "Configuración".
- A **`SettingsDialog.svelte`** dialog, same structure and motion as
  `HelpDialog`/`BackupDialog`. Sectioned layout; today one `<section>`:
  "Tamaño de texto". Adding a future section = adding another `<section>`, no
  structural change.
- **Tamaño de texto section:**
  - Two buttons **A−** and **A+**, plus the current value shown as a percentage
    (e.g. "100%").
  - Discrete steps: **90 · 100 · 110 · 125 · 140 · 160 %**. Default **100%**.
  - **A−** disabled at the minimum, **A+** disabled at the maximum.
  - A **"Restablecer"** button that returns to 100% (disabled when already 100%).
  - Changing the value **rescales only the note text** — body lines and block
    headings (`--h1/h2/h3`) and the note title scale proportionally. Icons,
    sidebar, menus, and dialog chrome are untouched.
  - **Live preview:** the dialog sits over the note, so pressing A+/A− grows or
    shrinks the text behind it immediately.
- **Persistence:** a new preference **`editorTextScale`** (a number, the scale
  factor, e.g. `1`, `1.25`) declared in `settings-registry.ts` with
  `backupSafe: true`, and read/written through a typed wrapper in `settings.ts`
  (`getEditorTextScale` / `setEditorTextScale`), mirroring the existing
  preferences. Saved immediately on each press, like the theme toggle.

## What does not enter

- **Scaling the whole app** (icons, sidebar, chrome). Only note text scales.
- **A slider or free-form input.** Discrete steps only.
- **Any future settings section** (MCP, sync, export options). The dialog is
  built to hold them; none are implemented here.
- **Moving the theme toggle into the dialog.** The sun/moon stays a quick
  top-bar toggle for now. (It may migrate later; out of scope.)
- **Per-note text size.** The scale is a single global preference.
- **Animating the text resize itself** (see Motion — resize is instant to
  respect the spec 024 cursor/reflow guard).

## Model of data affected

No schema change — reuses the existing key-value `settings` table.

- **New key:** `editorTextScale`. Value: a number in the allowed step set.
  Absent/invalid → treated as `1` (100%).
- `settings-registry.ts`: add `editorTextScale: 'editorTextScale'` to `KEY` and
  `[KEY.editorTextScale]: { backupSafe: true }` to `SETTINGS`. Because
  export/import filters through the registry (see `SAFE_SETTING_KEYS`), the
  scale rides along in backups and restores automatically — no other
  export/import change.

### Applying the scale (survives note switch / remount)

- A single CSS custom property **`--cn-editor-scale`** (default `1`) is set on a
  **stable root** (`document.documentElement`), not on the editor container —
  the editor is keyed on `noteId`/`dataVersion` and remounts on note switch, so
  the var must live above it to persist visually across remounts.
- Only editor text reads it. In `app.css`, the editor text root and
  `.block-editable` derive their font-size from
  `calc(<base> * var(--cn-editor-scale, 1))`; headings/title use `em` (relative)
  so they scale with the base. Nothing outside the editor references the var, so
  the rest of the UI is unaffected.
- **Pure step helper** in a small module (`src/lib/settings/text-scale.ts`):
  `SCALE_STEPS` (the ordered array), `DEFAULT_SCALE = 1`, and
  `nextScale(current, direction)` returning the next allowed step clamped at the
  ends, with any unknown/invalid `current` snapping to `DEFAULT_SCALE`. This is
  the single tested seam; the component and boot code call it.
- **Boot:** on load, read `editorTextScale`, snap through the helper, and set
  `--cn-editor-scale` once (in `+layout.svelte` or `+page.svelte` startup,
  alongside how the theme is applied).

## User flows

**Enlarge the note text**
1. User clicks the gear ⚙️ → Configuración opens (scales in, backdrop fades).
2. Under "Tamaño de texto" they see "100%".
3. They press **A+** twice → the note text behind the dialog grows to 110%, 125%
   instantly; the value updates with a subtle pulse.
4. They close the dialog (or press Escape). Reloading CopyNotes keeps the larger
   text. Switching notes keeps it too.

**Back to default**
1. Open Configuración → press **Restablecer** → text returns to 100%; the button
   disables.

**At the limits**
- At 90%, **A−** is disabled; at 160%, **A+** is disabled — no dead presses.

**Reduce-motion user**
- Same feature; dialog appears without scale/travel, value updates without the
  pulse (see Motion).

## Motion (Quiet Motion — spec 024)

Reuse the shared system; add no new timings or dependencies. Route every Svelte
transition duration through `motionDuration()` from `$lib/motion`.

- **Gear button:** identical to its top-bar siblings — `bg-accent` color
  transition at `--motion-fast` (150ms), `active:translate-y-px`. Nothing new.
- **Settings dialog:** same open/close as `HelpDialog`/`BackupDialog` (spec 024
  Stage 3) — backdrop `fade`, content scale `0.98 → 1` with ≤4px vertical
  travel, exit slightly faster than entry, focus returns to the gear button on
  close, **Escape closes immediately even mid-entry**. Durations via
  `motionDuration(MOTION.overlay)`.
- **A− / A+ / Restablecer:** existing button feedback — color transition at
  `--motion-fast`, `active:translate-y-px`. Disabled state via opacity.
- **Percentage value:** a subtle confirmation pulse on change, reusing the
  existing `cn-pulse` class (500ms, `--motion-ease`) — the same micro-feedback
  used elsewhere. Instant under reduce-motion.
- **The text resize is instant — never animated.** Font-size is a layout
  property; animating it would reflow the editor and can jump the caret, which
  spec 024 forbids ("never animate layout properties where it can cause reflow
  or cursor jump"; "never transform a contenteditable"). Only the dialog and the
  value indicator animate; the note text snaps to the new size.
- **Reduce-motion:** dialog appears without scale/travel, the value pulse is
  suppressed, everything still works — covered by the existing `app.css` guard
  (CSS) and `motionDuration()` (Svelte).

## Acceptance criteria

- A gear button appears in the top bar and opens the Configuración dialog.
- The dialog shows "Tamaño de texto" with A−, A+, the current %, and
  Restablecer.
- A+/A− change **only the note text** size (body + block headings + title
  scale); icons, sidebar, menus stay the same size.
- The change is visible immediately behind the dialog.
- A− is disabled at 90%; A+ is disabled at 160%; Restablecer is disabled at
  100%.
- The chosen size persists across reload and across note switches.
- The size is included in an exported backup and restored on import.
- The dialog uses the same Quiet Motion as the other dialogs; Escape closes it
  immediately; focus returns to the gear button.
- The note **text resize is instant** (no animated font-size); the caret never
  jumps because of it.
- Under reduce-motion, the dialog appears without scale/travel and the feature
  still works.
- `pnpm check` and `pnpm test` pass; nothing unrelated breaks.

## Minimum tests

**Unit (Vitest)**
- `settings-registry`: extend the existing test — `editorTextScale` is present
  and `backupSafe: true`; it appears in `SAFE_SETTING_KEYS`.
- `text-scale.ts`: `nextScale` moves up/down through `SCALE_STEPS`; clamps at
  both ends (min A− and max A+ are no-ops); an unknown/`undefined`/out-of-set
  `current` snaps to `DEFAULT_SCALE`.

**E2E (Playwright, `e2e/`)**
- Open Configuración from the gear, press **A+**, assert the note text grew
  (computed font-size of a block increased, or `--cn-editor-scale` on `<html>`
  changed), then **reload** and assert it persisted.
- `reducedMotion: 'reduce'` run: the dialog opens/closes with no travel/scale
  and the size still changes and persists.

## Agent notes

- Follow the project **User Guide Rule**: document this in `docs/guia/` in the
  **same commit** that implements it — the gear/Configuración and how to change
  text size, plus the reduce-motion note if relevant. Create a new topic file if
  none fits, and bump the index date.
- Keep `--cn-editor-scale` on `document.documentElement` (stable), never on the
  remounting editor container, or the size flickers/resets on note switch.
- Do not add a raw color or a new timing token; reuse `$lib/motion` (`MOTION`,
  `motionDuration`) and the existing `--motion-*` CSS tokens.
- Keep `text-scale.ts` free of DOM/storage so it stays unit-testable in Node,
  mirroring how `settings-registry.ts` stays dependency-free.
- Save through the `settings.ts` typed wrapper + `settings-registry` KEY — never
  write the raw string key, so the name can't drift (spec 002 rule).
- The dialog structure is the seam for future settings (MCP per specs 011/012,
  sync per spec 010): add sections, don't restructure. Do not build them here.
