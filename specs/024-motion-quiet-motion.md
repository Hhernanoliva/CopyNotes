# 024 - Quiet Motion: App-Wide Animation System

Approved by Hernan 2026-07-19 (reviewed a pre-written plan; direction
confirmed as-is: Svelte-native + CSS only, no new libraries, max 240ms, all
interruptible, honors "reduce motion"). Builds in independent stages, each
reviewable and shippable on its own.

## Objective

Add professional, calm motion to CopyNotes **without changing the current
design**. After this work the "quiet" (at-rest) interface must look
identical to today: same colors, typography, spacing, sizes, editor/sidebar
layout, buttons, text, icons, dialog structure, and Quiet Ink identity.
Only **how elements appear, disappear, and respond** changes.

Internal name: **Quiet Motion**.

Principles:

- Calm and fast. Motion never delays typing.
- Nothing bounces or moves continuously.
- Max 240ms of movement.
- Every animation is interruptible.
- The OS/browser "reduce motion" preference is honored automatically.
- No new dependencies.

## What Enters

Motion on the app's main surfaces, staged as below. Technology used:

- **CSS transitions** for hover, press, icons, small state changes.
- **Svelte `fade`** for opacity.
- **Svelte `fly`** for sidebar, panels, menus.
- **Svelte `scale`** for the formatting toolbar and confirmations.
- **Svelte `slide`** only for small sidebar groups.
- **`animate:flip`** to settle sidebar lists after reorder.

Explicitly **not** used: GSAP, Lenis, Anime.js, scroll-driven animation,
continuous motion, cinematic effects, page/note transition effects.

### Timing (reuse existing `src/app.css` tokens)

- `--motion-fast: 150ms`, `--motion-overlay: 240ms`, `--motion-ease`.
- Buttons/icons: 120–150ms. Menus/tools: 150ms. Confirmations: 150ms.
  Sidebar/dialogs: 200–240ms. List settle after drag: 150–180ms. Copy
  confirmation visible 800–1000ms (state change, no continuous motion).
- Add a new numeric value only if it genuinely repeats across components.

### Discrete offsets

Movement distances are limited to **2px, 4px, 16px**. No other travel
distances. Only opacity and transforms — never animate layout properties
(width/height/top/left) where it can cause reflow or cursor jump.

## Stages

### Stage 1 — Motion base

Files: `src/app.css`, plus one small shared module only if numeric values
must be shared with Svelte.

1. Keep the existing timing tokens as the single source of truth.
2. Define the discrete offsets (2/4/16px) as shared constants.
3. Use only opacity and transform.
4. Remove any `transition-all` that touches these animations (known one:
   `Editor.svelte` tag button — replace with an explicit property list).
5. **Ensure Svelte's own transitions also collapse to 0ms under "reduce
   motion".** The existing `app.css` rule only disables CSS
   animations/transitions; Svelte-driven transitions (`fly`/`fade`/`scale`/
   `slide`) are inline JS and are NOT covered by it. Provide a shared helper
   that returns duration 0 when the user prefers reduced motion, and route
   all Svelte transition durations through it.
6. No new library.

Result: the whole app shares one rhythm and one feel, and "reduce motion"
is fully honored (CSS + Svelte).

### Stage 2 — Sidebar

File: `src/lib/components/NoteSidebar.svelte`.

- Mobile backdrop fades in/out; mobile sidebar flies in from the side.
- Folder arrow rotates on open/close; folder contents appear briefly.
- Dragged item gains minimal lift; list settles with `animate:flip`
  (notes, snippets, tags).
- Favorite star changes with a minimal scale. Row create/delete may use a
  short fade.
- **Desktop constraint:** test desktop sidebar width animation first. If
  changing its width shifts text or the cursor annoyingly, keep desktop
  width instant and only animate the panel contents.

### Stage 3 — Dialogs

Files: `BackupDialog.svelte`, `HelpDialog.svelte`, `NewSnippetDialog.svelte`,
`SearchDialog.svelte`.

- Backdrop fades; dialog content scales 0.98 → 1 with max 4px vertical
  travel; exit slightly faster than entry; backup step change uses a short
  fade.
- The dialog stays mounted until its exit finishes, then returns focus to
  the trigger button. Escape must always close immediately, even mid-entry.

### Stage 4 — Menus and panels

Files: `TagPicker.svelte`, `BlockActionsMenu.svelte`, `DatePanel.svelte`,
`LinkEditorPopover.svelte`, `SlashMenu.svelte`, `TextColorPopover.svelte`,
`FloatingFormattingToolbar.svelte`.

- Menus: opacity + 2–4px vertical movement, origin near the opening button.
- Formatting toolbar: minimal scale + fade. Color picker: quick appearance.
- The `/` menu does not animate each result; results that change while
  typing appear instantly.
- **Constraint:** the formatting toolbar must not chase the cursor with lag.
  Compute its position first, then appear already placed.

### Stage 5 — Editor micro-animations

Files: `BlockRow.svelte`, `Editor.svelte`, `src/routes/+page.svelte`.

- Copy / copy-with-children: icon briefly swaps to a confirmation.
- "Guardando" appears without flashy motion; "Guardado" fades in/out.
- Task check: mark appears with minimal scale. Favorite: star fill eases.
- Collapse block: arrow rotates, children disappear fast. Expand code:
  crossfade summary ↔ full. Date/tag: discrete appearance. Theme: crossfade
  sun ↔ moon icons.

Guards (hard rules):

- Do not animate the block being typed in. Never transform a
  `contenteditable`. Never animate cursor position or per-letter.
- Do not animate note switching or show the previous note during a switch.
- Do not use `animate:flip` on editor rows.

### Stage 6 — Drag and reorder

Files: `NoteSidebar.svelte`, `Editor.svelte`, `dragReorder.svelte.js`,
`dnd.ts`.

- Sidebar: minimal lift on grab, slight opacity drop on the origin gap,
  drop-target indicator fades, `animate:flip` settles the list on drop.
- Editor: animate only the ghost element and the indicator; real editable
  blocks never move via animation; focus and selection stay exactly where
  they were after drop.

### Stage 7 — Global elements

Files: `InstallPrompt.svelte`, `+layout.svelte`, `+page.svelte`.

- Unify the existing install-prompt animation with the global timings.
- Keep svelte-sonner toasts. Avoid a local confirmation and a redundant
  toast appearing at once. Keep the current initial loading state. No new
  glows, permanent pulses, or skeletons.

## What Does Not Enter

- Any new dependency.
- Any change to colors, sizes, spacing, or layout of the resting UI.
- Scroll-driven, continuous, or cinematic motion.
- Page/note transition effects.
- Animating `contenteditable`, cursor, per-letter, or note switching.
- `animate:flip` on editor rows.

## Data Model Affected

None. This is presentation only. No storage, clipboard, backup, or file
behavior changes. Animations are never wired to persistence.

## Reduced Motion

When macOS/iOS/browser "reduce motion" is on:

- Sidebar and panels appear without travel.
- Dialogs do not scale.
- Reorders apply instantly.
- Icon swaps use opacity only, or are instant.
- No feature becomes unavailable.

The existing `app.css` `@media (prefers-reduced-motion: reduce)` rule stays
as the global CSS guard; Stage 1 adds the matching guard for Svelte
transitions.

## Tauri 2 Compatibility

No special adaptation needed. Tauri 2 runs the same Svelte app inside
macOS WebKit; CSS and Svelte transitions work there. To keep it safe:
test main flows in WebKit; do not rely on experimental animation APIs; no
artificial scroll; keep animations disconnected from storage/clipboard/
files; reuse these timings for the future native macOS title bar.

## User Flows

- Normal user (reduce motion off): sees all Quiet Motion — dialogs scale in,
  sidebar flies in, lists settle after drag, icons crossfade.
- Reduce-motion user: same app, same features, changes appear instantly
  without travel or scale.
- Typing is never delayed or interrupted by any animation.

## Acceptance Criteria

- The resting UI is visually identical to today (colors, sizes, spacing,
  layout unchanged).
- All main surfaces have coherent motion.
- No animation exceeds 240ms.
- The editor responds as fast as before; the cursor never jumps due to an
  animation.
- Animations are interruptible (e.g. Escape closes a dialog mid-entry).
- "Reduce motion" works for both CSS and Svelte transitions.
- No dependencies added.
- Chromium and WebKit behave the same.
- A future Tauri 2 migration needs no rewrite of the animation system.

## Minimum Tests

Automated:

- `pnpm check` and `pnpm test` pass.
- Motion helper: returns 0 duration when reduced motion is preferred,
  configured duration otherwise.
- Existing Playwright suite passes.
- Playwright run with `reducedMotion: 'reduce'`: dialogs/panels appear with
  no travel/scale; features still work.
- Open/close a panel rapidly without breakage.
- Focus returns to the trigger after a dialog closes.
- Type while "Guardado" is showing — no interference.
- Reorder in Chromium and WebKit.

Manual:

- Open/close each panel fast; press Escape mid-entry.
- Type while feedback shows; switch notes rapidly.
- Select and format text; drag notes, folders, and blocks.
- Trackpad and touch; light and dark; reduce motion on.

## Agent Notes

- Each stage is independently reviewable. If any animation harms typing,
  the cursor, or clarity, remove it even if it looks nice.
- Stage 1 must land first; later stages depend on the shared helper and
  offsets.
- Keep the user guide (`docs/guia/`) updated in the same commit whenever a
  stage changes user-visible behavior (including the reduce-motion note).
- Order: base → sidebar → dialogs → menus/toolbar → editor micro →
  drag/reorder → global → verify (WebKit) → guide update → final motion +
  a11y audit.
