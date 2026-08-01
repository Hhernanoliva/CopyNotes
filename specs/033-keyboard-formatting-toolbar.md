# 033 - The formatting toolbar without a mouse

Created: 2026-08-01. Approved by Hernan 2026-08-01 (design reviewed in chat:
both direct size shortcuts and arrow navigation; entry key `Ctrl/Cmd+Alt+F`;
`Tab` activates like `Enter`, matching the slash and tag menus).

## Objective

Selecting text with the keyboard and then having to reach for the mouse to
press **H1** is the complaint that opened this spec. Bold, italic, underline,
strikethrough and link already have shortcuts, so the gap goes unnoticed until
you want a heading, a color, or **Quitar formato** — none of which can be
reached without a pointer today.

Two doors, because they serve different moments:

- **Shortcuts** for the sizes, the fast path for something used constantly.
- **Arrow navigation** for the toolbar itself, which covers *every* button,
  including the ones that will be added later, and is the ARIA toolbar pattern.

## What enters

### 1. Size shortcuts

| Keys | Command |
|---|---|
| `Ctrl/Cmd+Alt+1` | Título 1 |
| `Ctrl/Cmd+Alt+2` | Título 2 |
| `Ctrl/Cmd+Alt+3` | Título 3 |
| `Ctrl/Cmd+Alt+0` | Texto normal (¶) |

The same combination Google Docs and Notion use, so nothing new has to be
learned. They route through `runFormatCommand` — the single door that owns the
Undo step (spec 020) — via the existing `handleKeyboardFormat`, so they inherit
spec 032's gesture rule for free and need no branch of their own.

They work with no toolbar on screen, exactly like `Ctrl/Cmd+B` does.

### 2. The caret-only rule (fixes a regression from spec 032)

Spec 032 routed `h1`/`h2`/`h3`/`normal` by comparing the selected text against
the row's text. A **collapsed caret** selects nothing, so it fell to the inline
path, where `applySize` requires a range and returns without doing anything.

Result: with the caret parked inside bold text — where the toolbar does appear —
pressing H1 did nothing, though it converted the row before spec 032. The
shortcuts above would inherit the same dead spot.

The rule gains its missing case:

- **caret only, nothing selected** → `setBlockType` (the whole row)
- **selection equal to the row's text** → `setBlockType`
- **anything else** → the inline size mark

This is what the guide already promised ("con el cursor adentro alcanza") and
what Docs and Notion do. Spec 032 is amended, not contradicted: a partial
selection still never converts the row.

### 3. Arrow navigation in the toolbar

- **`Ctrl/Cmd+Alt+F`** moves focus to the first enabled button. It acts when the
  toolbar is on screen — that is, when something is selected, which is the
  moment the toolbar exists to serve.
- **`←` `→`** move between buttons, skipping disabled ones. They stop at the
  ends rather than wrapping; `Inicio`/`Fin` jump to the ends.
- **`Enter`, `Espacio` or `Tab`** activate the focused button. `Enter` and
  `Espacio` are the button's native behaviour and need no code; `Tab` is
  intercepted to match the slash and tag menus, which already pick with either.
- **`Shift+Tab`** goes to the previous button, so focus cannot fall out of the
  toolbar into nowhere.
- **`Escape`** returns to the text without applying anything (today's behaviour,
  unchanged).
- Applying a command returns focus to the row, which `runFormatCommand` already
  does for every toolbar command.

### 4. The three panels

Color, Enlace and Más opciones open a panel. When opened **from the keyboard**,
focus moves into the panel's first control, its items answer the same
`←` `→` `Inicio` `Fin` keys, and `Escape` closes the panel and returns focus to
the button that opened it — not to the text, which is where Escape lands today.
Opened with the mouse, nothing changes: the buttons already suppress focus on
mousedown, which is exactly the signal that tells the two paths apart.

The link panel keeps autofocusing its URL field, as it does now.

## What does not enter

- **A roving `tabindex`.** Entry is `Ctrl/Cmd+Alt+F` and movement is by arrows,
  so nothing depends on the toolbar's position in the page's tab order.
- **Wrapping** from the last button to the first. `Inicio`/`Fin` cover the jump.
- **Shortcuts for color, código or Quitar formato.** They are reachable by
  arrows now; inventing four more combinations is not worth the memory load.
- **Building the toolbar when it is not on screen.** `Ctrl/Cmd+Alt+F` with a
  bare caret and no selection does nothing.
- **Changing what any button does.** This spec only adds ways to reach them.

## Model of data affected

None. No storage, no schema, no preference. Focus and key handling only.

Touched:

- **`editor/toolbar-keys.ts`** (new) — one pure function,
  `nextToolbarIndex(current, count, key, shiftKey)` → the index to focus, or
  `null` when the key is not ours. No DOM, so it is unit-testable on its own.
- **`FloatingFormattingToolbar.svelte`** — a `keydown` handler on the container
  that resolves the group of buttons the focus sits in (the button row, or the
  open panel), asks `nextToolbarIndex` where to go, and focuses it. Plus the
  `Tab`-activates line and the panel-opener memory.
- **`TextColorPopover.svelte`** — nothing structural: its buttons are already
  real `<button>`s, so the container handler reaches them.
- **`Editor.svelte`** — `Ctrl/Cmd+Alt+1/2/3/0` in the existing shortcut branch,
  `Ctrl/Cmd+Alt+F` focusing the toolbar, and the caret-only rule in
  `runFormatCommand`.

## User flows

1. **Heading without the mouse.** `Shift+↑` marks the row, `Ctrl/Cmd+Alt+1`
   turns it into Título 1. The toolbar is never touched.
2. **Enlarge a fragment.** `Shift+→` marks a few words, `Ctrl/Cmd+Alt+2` leaves
   them bigger on the same line (spec 032's inline size).
3. **Color without the mouse.** Mark the text, `Ctrl/Cmd+Alt+F`, `→` to Color de
   texto, `Enter` opens the palette with focus on it, `→` to Rojo, `Enter`
   applies and returns to the text.
4. **Back out.** `Ctrl/Cmd+Alt+F`, then `Escape`: the caret is back in the text,
   nothing applied.
5. **Caret only.** Cursor inside bold text, no selection, `Ctrl/Cmd+Alt+3`: the
   whole row becomes Título 3.

## Acceptance criteria

- The four shortcuts apply their command with a selection and with a bare caret.
- A partial selection + a shortcut still applies the inline size, never a row
  conversion.
- Each shortcut creates exactly one Undo step (they share the single door).
- `Ctrl/Cmd+Alt+F` lands on the first *enabled* button.
- `←` `→` never land on a disabled button and never leave the toolbar.
- `Tab` applies the focused button; `Shift+Tab` moves back one.
- The toolbar stays open the whole time focus is inside it.
- `Escape` inside a panel returns to the button that opened it; `Escape` on the
  row of buttons returns to the text with the selection intact.
- Nothing changes for mouse users.

## Minimum tests

Unit (`toolbar-keys.test.ts`):

- `→` from the last index returns null (no wrap); `←` from 0 returns null.
- `Inicio`/`Fin` return the ends.
- `Shift+Tab` behaves as `←`.
- An unrelated key returns null.

E2E (`e2e/formatting.spec.ts`):

- `Ctrl/Cmd+Alt+1` over a full-row selection converts the block; over a partial
  selection it leaves an `fmt-size-h1` span and the block untouched.
- Caret only (no selection) + `Ctrl/Cmd+Alt+3` converts the row.
- `Ctrl/Cmd+Alt+F` → `→` → `Enter` applies the second button's command, and the
  caret ends up back in the text.
- `Ctrl/Cmd+Alt+F` → `Escape` closes the toolbar with nothing applied.
- Colour by keyboard end to end (flow 3 above).

## Agent notes

- The panel-opener memory is what tells a keyboard open from a mouse open. It
  works because `FormattingButton` and the panel items call
  `preventDefault()` on `mousedown`, so a mouse click never focuses the button
  — deliberate, and the reason the text selection survives a click.
- `refreshToolbar` already refuses to rebuild while focus sits inside
  `[data-copynotes-toolbar]`. Arrow navigation depends on that guard; do not
  weaken it.
- `Ctrl/Cmd+Alt+0` uses the digit zero for "no size", mirroring `¶`.
- Do not intercept `Tab` while focus is in the row of blocks: there it nests
  rows (spec 031 and `handleSelectionKeys`). The interception lives inside the
  toolbar component only.
