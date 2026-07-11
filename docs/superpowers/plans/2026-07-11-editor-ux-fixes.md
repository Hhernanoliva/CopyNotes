# Editor UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six daily-writing fixes on CopyNotes' existing custom block editor (spec `019-editor-ux-fixes.md`), without migrating to a rich-text engine.

**Architecture:** Keep the block-per-`contenteditable` model. Add pure, DOM-free helper modules (`editor/paste.ts`, `editor/history.ts`, `editor/caret.ts`) that carry the risky logic under Vitest, and wire them into `Editor.svelte` / `BlockRow.svelte`. Persist through the existing storage layer; no schema change.

**Tech Stack:** SvelteKit, Svelte 5 (runes), plain JS in `.ts`/`.svelte`, Dexie, Vitest + Testing Library, Playwright. Package manager: pnpm.

## Global Constraints

- Spec 015 stands: **no** TipTap/Lexical/ProseMirror. Editor stays custom, block-oriented.
- **Out of scope:** continuous character-level selection across blocks (request #4). Selection stays block-level.
- Plain JS style inside `.ts`/`.svelte` — **no type annotations** unless already present in vendored code.
- Svelte 5 rules: `$derived` for computed values, `$effect` only for outside-world actions with cleanup; never assign `$state` inside `$effect` to compute; don't destructure `$state`; `$state.snapshot(...)` before any Dexie write.
- Design tokens only (shadcn-svelte CSS vars); no raw hex. Match existing hover/focus reveal pattern.
- **User Guide Rule:** update `docs/guia-de-uso.md` in the SAME commit as each user-visible fix, in plain Spanish, and bump its "Última actualización" date.
- Test commands: unit `pnpm test:unit -- --run <path>`; e2e `pnpm test:e2e`.
- One task per fix, in order. Each task ends green and is committed. Approval between tasks.

---

### Task 1: Delete note from the "Notas" list

**Files:**
- Modify: `src/lib/components/NoteSidebar.svelte` (notes `<li>` ~183-201; add `onDeleteNote` prop ~15-37)
- Modify: `src/routes/+page.svelte` (add `deleteNote`; pass `onDeleteNote` ~249-271)
- Modify: `docs/guia-de-uso.md`
- Test: `src/lib/components/NoteSidebar.delete.test.ts` (new)

**Interfaces:**
- Consumes: `softDeleteNote(id)` from `$lib/storage` (exists, `storage/notes.ts`).
- Produces: `NoteSidebar` prop `onDeleteNote(id)`; `+page` function `deleteNote(id)`.

- [ ] **Step 1: Write the failing component test**

```js
// src/lib/components/NoteSidebar.delete.test.ts
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expect, it, vi } from 'vitest';
import NoteSidebar from './NoteSidebar.svelte';

it('shows a delete button per note and calls onDeleteNote with the id', async () => {
	const onDeleteNote = vi.fn();
	render(NoteSidebar, {
		props: {
			notes: [{ id: 'n1', title: 'Primera' }],
			currentNoteId: 'n1',
			open: true,
			view: 'notes',
			onSelect: () => {}, onCreate: () => {}, onClose: () => {}, onBackup: () => {},
			onNewSnippet: () => {}, onToggleFavorite: () => {}, onInsertSnippet: () => {},
			onDeleteSnippet: () => {}, onExportSnippets: () => {}, onCreateTag: () => {},
			onRenameTag: () => {}, onDeleteTag: () => {}, onSnippetTagPick: () => {},
			onSnippetUntag: () => {}, onDeleteNote
		}
	});
	const btn = screen.getByRole('button', { name: /borrar nota primera/i });
	btn.click();
	await tick();
	expect(onDeleteNote).toHaveBeenCalledWith('n1');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test:unit -- --run src/lib/components/NoteSidebar.delete.test.ts`
Expected: FAIL — no button matching "Borrar nota Primera".

- [ ] **Step 3: Add the `onDeleteNote` prop**

In `NoteSidebar.svelte` `$props()` destructure (~15-37) add `onDeleteNote,`.

- [ ] **Step 4: Add the delete button in the note row**

Replace the note `<li>` (~184-201) so the selectable button and a trash button sit in a `group` row, mirroring the tags list pattern (~322-368). Use `Trash2` (already imported). Exact markup:

```svelte
<li class="group hover:bg-accent flex items-center gap-1 rounded-md pr-1 transition-colors duration-(--motion-fast) {currentNoteId === note.id ? 'bg-accent' : ''}">
	<button
		type="button"
		onclick={() => onSelect(note.id)}
		aria-current={currentNoteId === note.id ? 'page' : undefined}
		class="focus-visible:ring-ring flex min-h-(--touch-target) min-w-0 flex-1 items-center rounded-md px-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none md:min-h-9 {currentNoteId === note.id ? 'text-foreground' : 'text-muted-foreground'}"
	>
		{#if note.title}
			<span class="truncate">{note.title}</span>
		{:else}
			<span class="text-faint">Sin título</span>
		{/if}
	</button>
	<button
		type="button"
		aria-label="Borrar nota {note.title || 'sin título'}"
		title="Borrar nota"
		onclick={() => onDeleteNote(note.id)}
		class="text-faint hover:text-destructive focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-sm opacity-0 max-md:opacity-100 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none md:size-7"
	>
		<Trash2 size={14} aria-hidden="true" />
	</button>
</li>
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm test:unit -- --run src/lib/components/NoteSidebar.delete.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire `deleteNote` in `+page.svelte`**

Add `softDeleteNote` to the `$lib/storage` import. Add function and pass the prop:

```js
async function deleteNote(id) {
	await softDeleteNote(id);
	notes = notes.filter((note) => note.id !== id);
	if (currentNoteId === id) {
		const next = notes[0];
		currentNoteId = next ? next.id : null;
		if (next) setLastOpenedNoteId(next.id);
	}
	toast.success('Nota borrada');
}
```

On `<NoteSidebar ... />` add `onDeleteNote={deleteNote}`.

- [ ] **Step 7: Manual check + guide + commit**

`pnpm dev`, hover a note, delete it, confirm the list updates and the editor follows. Add a line to `docs/guia-de-uso.md` under the notes section ("Borrá una nota con el tacho que aparece al pasar el mouse por la lista; se puede recuperar desde un respaldo") and bump the date.

```bash
git add src/lib/components/NoteSidebar.svelte src/lib/components/NoteSidebar.delete.test.ts src/routes/+page.svelte docs/guia-de-uso.md
git commit -m "feat: 019 fix 1 — delete note from the Notas list"
```

---

### Task 2: Ctrl/Cmd+F opens search seeded with the selection

**Files:**
- Modify: `src/routes/+page.svelte` (`handleShortcut` ~114-124; `<SearchDialog>` ~275; add `searchSeed` state)
- Modify: `src/lib/components/SearchDialog.svelte` (`$props` ~12; open effect ~25-35)
- Modify: `docs/guia-de-uso.md`
- Test: `src/lib/components/SearchDialog.seed.test.ts` (new)

**Interfaces:**
- Produces: `SearchDialog` gains prop `initialQuery` (string, default `''`); seeds its `text` on open.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/components/SearchDialog.seed.test.ts
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { expect, it, vi } from 'vitest';
import SearchDialog from './SearchDialog.svelte';

// jsdom lacks <dialog>.showModal; stub so the open effect runs.
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function () { this.open = true; };
	HTMLDialogElement.prototype.close = function () { this.open = false; };
});

it('seeds the query from initialQuery when opened', async () => {
	render(SearchDialog, { props: { open: true, initialQuery: 'factura', onOpenNote: vi.fn() } });
	await tick();
	const input = screen.getByLabelText('Texto a buscar');
	expect(input.value).toBe('factura');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test:unit -- --run src/lib/components/SearchDialog.seed.test.ts`
Expected: FAIL — value is `''`.

- [ ] **Step 3: Seed the dialog**

In `SearchDialog.svelte`: add `initialQuery = ''` to `$props()`. In the open branch of the effect (~28-31) replace `text = '';` with `text = initialQuery ?? '';`.

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm test:unit -- --run src/lib/components/SearchDialog.seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire Ctrl/Cmd+F in `+page.svelte`**

Add `let searchSeed = $state('');`. In `handleShortcut`, before the `k` branch:

```js
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
	event.preventDefault();
	searchSeed = window.getSelection()?.toString().trim() ?? '';
	searchOpen = true;
	return;
}
```

In the `k` branch set `searchSeed = '';` before `searchOpen = true;`. On `<SearchDialog>` add `initialQuery={searchSeed}`.

- [ ] **Step 6: Manual check + guide + commit**

`pnpm dev`: select a word in a block, press Ctrl+F → search opens with the word, browser Find does not appear. Ctrl+K still opens empty. Add to guide (atajos): "Ctrl/Cmd+F abre la búsqueda; si tenías texto seleccionado, entra ya cargado." Bump date.

```bash
git add src/lib/components/SearchDialog.svelte src/lib/components/SearchDialog.seed.test.ts src/routes/+page.svelte docs/guia-de-uso.md
git commit -m "feat: 019 fix 2 — Ctrl/Cmd+F opens search with the selection"
```

---

### Task 3: Arrow Up/Down navigate between blocks, column-preserving

**Files:**
- Create: `src/lib/editor/caret.ts` (pure-ish caret helpers)
- Create: `src/lib/editor/caret.test.ts`
- Modify: `src/lib/editor/BlockRow.svelte` (`handleKeydown` ~117-155; forward a new `onVerticalArrow`)
- Modify: `src/lib/editor/Editor.svelte` (reuse `caretAtBlockEdge` ~362-376; add cross-block caret placement; pass handler ~700-744)
- Modify: `docs/guia-de-uso.md`

**Interfaces:**
- Produces (`caret.ts`):
  - `caretColumnX()` → number|null: x-pixel of the current collapsed caret, or null if no caret.
  - `placeCaretAtColumn(el, x, edge)` → boolean: put the caret in `el` at horizontal pixel `x` on its top line (`edge==='top'`) or bottom line (`edge==='bottom'`); returns false if it could not resolve a point (caller then falls back to start/end).
- `BlockRow` gains prop `onVerticalArrow(block, direction, columnX)`; `Editor` implements it: focus neighbour, then `placeCaretAtColumn`.

- [ ] **Step 1: Write the failing test (guard logic that is DOM-free)**

`caret.ts` is DOM-bound, so test the one pure decision it exposes — clamping `edge`. Extract a tiny pure helper and test it:

```js
// src/lib/editor/caret.test.ts
import { expect, it } from 'vitest';
import { edgeForDirection } from './caret';

it('maps arrow direction to the line edge of the target block', () => {
	// Going up lands on the previous block's BOTTOM line.
	expect(edgeForDirection(-1)).toBe('bottom');
	// Going down lands on the next block's TOP line.
	expect(edgeForDirection(1)).toBe('top');
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test:unit -- --run src/lib/editor/caret.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `caret.ts`**

```js
// src/lib/editor/caret.ts
// Cross-block caret helpers for arrow navigation (spec 019, fix 3). DOM-bound
// except edgeForDirection, which is pure and unit-tested.

// Up moves to the previous block's bottom line; down to the next block's top.
export function edgeForDirection(direction) {
	return direction < 0 ? 'bottom' : 'top';
}

// X pixel of the current collapsed caret, or null when there is no caret.
export function caretColumnX() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	const rects = range.getClientRects();
	const rect = rects.length ? rects[0] : range.getBoundingClientRect();
	return rect ? rect.left : null;
}

// Place the caret in `el` at horizontal pixel `x`, on its top or bottom line.
// Returns false when no point resolves (caller falls back to start/end).
export function placeCaretAtColumn(el, x, edge) {
	const box = el.getBoundingClientRect();
	const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
	const y = edge === 'top' ? box.top + lineHeight / 2 : box.bottom - lineHeight / 2;
	const clampedX = Math.min(Math.max(x, box.left + 1), box.right - 1);
	const point = caretPointFromXY(clampedX, y, el);
	if (!point) return false;
	const sel = window.getSelection();
	const range = document.createRange();
	range.setStart(point.node, point.offset);
	range.collapse(true);
	sel.removeAllRanges();
	sel.addRange(range);
	return true;
}

// Cross-browser caretPositionFromPoint / caretRangeFromPoint, restricted to el.
function caretPointFromXY(x, y, el) {
	if (document.caretPositionFromPoint) {
		const pos = document.caretPositionFromPoint(x, y);
		if (pos && el.contains(pos.offsetNode)) return { node: pos.offsetNode, offset: pos.offset };
	} else if (document.caretRangeFromPoint) {
		const range = document.caretRangeFromPoint(x, y);
		if (range && el.contains(range.startContainer))
			return { node: range.startContainer, offset: range.startOffset };
	}
	return null;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm test:unit -- --run src/lib/editor/caret.test.ts`
Expected: PASS.

- [ ] **Step 5: Forward the key from `BlockRow.svelte`**

Add `onVerticalArrow` to `$props()`. In `handleKeydown`, after the slash-menu guard and before the Tab handling, add (bare Up/Down only; modifiers already handled elsewhere):

```js
if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
	const direction = event.key === 'ArrowDown' ? 1 : -1;
	// Let Editor decide if the caret is at the block edge; it returns true when
	// it consumed the key (moved to a neighbour).
	if (onVerticalArrow?.(block, direction, event)) event.preventDefault();
	return;
}
```

Note: pass the raw `event` so the handler can read the caret before default; it calls `preventDefault` itself by returning true. Adjust: change the block above to compute intent in Editor. (Keep BlockRow dumb — it just forwards.)

- [ ] **Step 6: Implement `onVerticalArrow` in `Editor.svelte`**

Import `caretColumnX, placeCaretAtColumn, edgeForDirection` from `./caret`. Add:

```js
function handleVerticalArrow(block, direction) {
	if (hasSelection) return false; // selection keys own arrows then
	if (!caretAtBlockEdge(direction)) return false; // mid-block: let browser move
	const neighborId = neighborVisibleId(blocks, block.id, direction);
	if (!neighborId) return false;
	const x = caretColumnX();
	focusBlockId = neighborId; // focuses the neighbour's editable next tick
	requestAnimationFrame(() => {
		const el = document.querySelector(`[data-block-id="${neighborId}"] [contenteditable]`);
		if (!el) return;
		if (x == null || !placeCaretAtColumn(el, x, edgeForDirection(direction))) {
			// fallback: caret to natural end
			const sel = window.getSelection();
			sel.selectAllChildren(el);
			sel.collapseToEnd();
		}
	});
	return true;
}
```

Add `data-block-id={block.id}` to the block wrapper `<div>` in `BlockRow.svelte` (~193) so the query above resolves. Pass `onVerticalArrow={handleVerticalArrow}` to `<BlockRow>`. **Caution:** the existing `focused` effect in BlockRow moves the caret to end on focus; guard it so it does not fight `placeCaretAtColumn` — only auto-place-to-end when focus was NOT caused by a vertical arrow. Simplest: in `handleVerticalArrow` set a module flag `verticalNav = true`, and in BlockRow's focus effect skip the `collapseToEnd` when the incoming focus is from vertical nav. Implement by passing `focusCaret` intent through `focusBlockId` as `{ id, caret: 'column' }` OR keep it pragmatic: have Editor own caret placement and change BlockRow's focus effect to only `el.focus()` (no forced caret) when `block.type !== 'separator'`, letting Editor place the caret. Pick the pragmatic route and verify Enter-created blocks still land the caret at end (they should, since new blocks are empty).

- [ ] **Step 7: Manual check**

`pnpm dev`: multi-line note; Down from a top line moves within the block; Down from the last line jumps to the next block at the same column; Up mirrors it. Wrapped long lines behave. Enter still creates a block with caret ready.

- [ ] **Step 8: Guide + commit**

Guide (navegación): "Movete entre renglones con las flechas ↑ ↓; el cursor mantiene la columna." Bump date.

```bash
git add src/lib/editor/caret.ts src/lib/editor/caret.test.ts src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte docs/guia-de-uso.md
git commit -m "feat: 019 fix 3 — arrow up/down navigate between blocks"
```

---

### Task 4: Ctrl/Cmd+Enter = gray note · Shift+Enter = soft break

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte` (`handleKeydown` ~117-155; add pre-wrap class ~281-287)
- Modify: `src/lib/copy/format.ts` (bullet/todo internal `\n` handling)
- Modify: `src/lib/copy/format.test.ts` (add cases)
- Modify: `docs/guia-de-uso.md`

**Interfaces:** no new module exports; behavior change only.

- [ ] **Step 1: Write failing copy-format tests**

Add to `src/lib/copy/format.test.ts`:

```js
it('keeps a soft line break inside a bullet as a hanging line (plain text)', () => {
	const blocks = [{ id: 'a', parentBlockId: null, type: 'bullet', content: 'uno\ndos', order: 1 }];
	const tree = buildCopyTree(blocks, 'a', false);
	expect(formatPlainText(tree)).toBe('- uno\n  dos');
});

it('renders a soft line break inside a bullet as <br> in HTML', () => {
	const blocks = [{ id: 'a', parentBlockId: null, type: 'bullet', content: 'uno\ndos', order: 1 }];
	const tree = buildCopyTree(blocks, 'a', false);
	expect(formatHtml(tree)).toContain('uno<br>dos');
});
```

(Match the existing import style at the top of `format.test.ts`.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:unit -- --run src/lib/copy/format.test.ts`
Expected: FAIL — bullet line is `- uno\ndos` (prefix breaks) and HTML lacks `<br>`.

- [ ] **Step 3: Handle internal `\n` in `format.ts`**

In `plainLines`, replace the bullet/todo single-line builds so extra lines hang-indent under the marker:

```js
function hangingLines(indent, marker, content) {
	const [first, ...rest] = content.split('\n');
	const pad = indent + ' '.repeat(marker.length);
	return [indent + marker + first, ...rest.map((line) => pad + line)];
}
// bullet:
lines = hangingLines(indent, '- ', block.content);
// todo:
lines = hangingLines(indent, `- ${todoMark(block)} `, block.content);
```

In `htmlContent`, make todo and the default text branch join internal lines with `<br>`:

```js
function inlineHtml(content) {
	return content.split('\n').map(escapeHtml).join('<br>');
}
// todo branch: return todoMark(block) + ' ' + inlineHtml(block.content) + noteHtml(block);
// default (text/bullet content in htmlNode via <li>): use inlineHtml(block.content)
```

Update `formatHtml`'s lone-text `<p>` branch to use `inlineHtml` too. Keep `code` as-is (`<pre>` preserves newlines).

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test:unit -- --run src/lib/copy/format.test.ts`
Expected: PASS (and existing format tests still green).

- [ ] **Step 5: Swap the key bindings in `BlockRow.svelte`**

In `handleKeydown`, replace the Shift+Enter block (~125-129) and add the Ctrl+Enter + soft-break behavior:

```js
// Ctrl/Cmd+Enter opens/edits the gray block note.
if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && block.type !== 'code' && block.type !== 'separator') {
	event.preventDefault();
	openNote();
	return;
}
// Shift+Enter inserts a soft line break inside this block (not a new block).
if (event.key === 'Enter' && event.shiftKey && block.type !== 'separator') {
	event.preventDefault();
	document.execCommand('insertLineBreak');
	onInput(block, el.textContent); // persist the new content with \n
	return;
}
if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
	event.preventDefault();
	onEnter(block);
	return;
}
```

Note: `insertLineBreak` is the reliable plaintext-only soft break; it keeps the caret after the break. If a target browser drops it, fall back to manual range insert of `'\n'`.

- [ ] **Step 6: Show soft breaks — add pre-wrap**

In the editable `class` (~281-287), for non-code blocks add `whitespace-pre-wrap`. Currently only code has `whitespace-pre-wrap`; add it to the base so text/bullet/todo render `\n`. Verify the empty-placeholder `::before` still shows (it targets `:empty`, unaffected).

- [ ] **Step 7: Manual check**

`pnpm dev`: Shift+Enter adds a line inside the bullet; Ctrl+Enter opens the gray note; Enter still makes a new block. Reload → soft break persists. Copy the bullet → paste in a plain editor shows the hanging line.

- [ ] **Step 8: Guide + commit**

Guide (atajos): update the Shift+Enter line to "Shift+Enter agrega un salto de línea dentro del mismo renglón; Ctrl/Cmd+Enter agrega/edita la nota gris del renglón." Bump date.

```bash
git add src/lib/editor/BlockRow.svelte src/lib/copy/format.ts src/lib/copy/format.test.ts docs/guia-de-uso.md
git commit -m "feat: 019 fix 4 — Ctrl+Enter note, Shift+Enter soft break"
```

---

### Task 5: Multi-line paste → blocks (bullets/todos recognised, blanks ignored)

**Files:**
- Create: `src/lib/editor/paste.ts` (pure parser)
- Create: `src/lib/editor/paste.test.ts`
- Modify: `src/lib/editor/BlockRow.svelte` (add `onpaste`; forward via `onPasteLines`)
- Modify: `src/lib/editor/Editor.svelte` (insert-many handler + persist + focus)
- Modify: `docs/guia-de-uso.md`

**Interfaces:**
- Produces (`paste.ts`): `parsePastedLines(text)` → array of `{ type, content, checked }` where `type ∈ {'text','bullet','todo'}`, `checked` present only for todos. Blank/whitespace-only lines dropped. Returns `[]` for empty input.
- `BlockRow` gains prop `onPasteLines(block, parsedLines)`; `Editor` inserts them as siblings after `block`.

- [ ] **Step 1: Write failing parser tests**

```js
// src/lib/editor/paste.test.ts
import { expect, it, describe } from 'vitest';
import { parsePastedLines } from './paste';

describe('parsePastedLines', () => {
	it('drops blank lines and keeps order', () => {
		expect(parsePastedLines('uno\n\n\ndos')).toEqual([
			{ type: 'text', content: 'uno' },
			{ type: 'text', content: 'dos' }
		]);
	});
	it('recognises -, *, • as bullets', () => {
		expect(parsePastedLines('- a\n* b\n• c')).toEqual([
			{ type: 'bullet', content: 'a' },
			{ type: 'bullet', content: 'b' },
			{ type: 'bullet', content: 'c' }
		]);
	});
	it('recognises [ ] and [x] as todos with checked state', () => {
		expect(parsePastedLines('[ ] pan\n[x] llamar\n[X] pagar')).toEqual([
			{ type: 'todo', content: 'pan', checked: false },
			{ type: 'todo', content: 'llamar', checked: true },
			{ type: 'todo', content: 'pagar', checked: true }
		]);
	});
	it('treats everything else as text and trims \\r', () => {
		expect(parsePastedLines('hola\r\nchau')).toEqual([
			{ type: 'text', content: 'hola' },
			{ type: 'text', content: 'chau' }
		]);
	});
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:unit -- --run src/lib/editor/paste.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `paste.ts`**

```js
// src/lib/editor/paste.ts
// Pure clipboard-line parser for multi-line paste (spec 019, fix 5).
// Blank lines are dropped; bullets (- * •) and todos ([ ]/[x]) are recognised.

const BULLET = /^\s*[-*•]\s+(.*)$/;
const TODO = /^\s*\[( |x|X)\]\s+(.*)$/;

export function parsePastedLines(text) {
	if (!text) return [];
	const out = [];
	for (const raw of text.split('\n')) {
		const line = raw.replace(/\r$/, '');
		if (line.trim() === '') continue;
		const todo = line.match(TODO);
		if (todo) {
			out.push({ type: 'todo', content: todo[2], checked: todo[1].toLowerCase() === 'x' });
			continue;
		}
		const bullet = line.match(BULLET);
		if (bullet) {
			out.push({ type: 'bullet', content: bullet[1] });
			continue;
		}
		out.push({ type: 'text', content: line });
	}
	return out;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test:unit -- --run src/lib/editor/paste.test.ts`
Expected: PASS.

- [ ] **Step 5: Handle the paste event in `BlockRow.svelte`**

Add `onPasteLines` to `$props()`. Add an `onpaste` handler on the editable div (~264-287):

```js
function handlePaste(event) {
	const text = event.clipboardData?.getData('text/plain') ?? '';
	if (!text.includes('\n')) return; // single line: let the browser paste inline
	event.preventDefault();
	onPasteLines?.(block, text);
}
```

Wire `onpaste={handlePaste}` on the editable div.

- [ ] **Step 6: Insert-many in `Editor.svelte`**

Add a handler that parses, writes the first line into the current block, and creates the rest as siblings after it. Reuse `planEnter`/`createBlock` ordering, or insert sequentially:

```js
import { parsePastedLines } from './paste';

async function handlePasteLines(block, text) {
	const parsed = parsePastedLines(text);
	if (parsed.length === 0) return;
	// First line merges into the current block (respect existing content + caret).
	const [first, ...rest] = parsed;
	block.type = first.type;
	block.content = first.content;
	if (first.type === 'todo') block.checked = first.checked;
	const firstChanges = { type: first.type, content: first.content };
	if (first.type === 'todo') firstChanges.checked = first.checked;
	await updateBlock(block.id, firstChanges);
	let afterId = block.id;
	for (const line of rest) {
		const plan = planEnter(blocks, afterId);
		if (!plan) break;
		await applyUpdates(plan.updates);
		const created = await createBlock({
			noteId: note.id,
			parentBlockId: plan.parentBlockId,
			type: line.type,
			order: plan.order,
			content: line.content,
			...(line.type === 'todo' ? { checked: line.checked } : {})
		});
		blocks = [...blocks, created];
		afterId = created.id;
	}
	focusBlockId = afterId;
}
```

Verify `createBlock` (storage/blocks.ts) accepts `content`/`checked`; if it ignores them, follow the create with an `updateBlock(created.id, { content, checked })`. Pass `onPasteLines={handlePasteLines}` to `<BlockRow>`.

- [ ] **Step 7: Manual check**

`pnpm dev`: copy a 5-line list (mix of plain lines, bullets, `[ ]` todos, a blank line) from elsewhere, paste into a block → one block per non-empty line, bullets and todos recognised, blank dropped. Single-line paste still inserts inline.

- [ ] **Step 8: Guide + commit**

Guide (escribir/pegar): "Pegá varias líneas y CopyNotes las separa en renglones; reconoce viñetas (- * •) y tareas ([ ] / [x]) e ignora las líneas en blanco." Bump date.

```bash
git add src/lib/editor/paste.ts src/lib/editor/paste.test.ts src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte docs/guia-de-uso.md
git commit -m "feat: 019 fix 5 — multi-line paste splits into blocks"
```

---

### Task 6: App-wide Undo / Redo (snapshot-based, per note)

**Files:**
- Create: `src/lib/editor/history.ts` (pure snapshot/diff helpers)
- Create: `src/lib/editor/history.test.ts`
- Modify: `src/lib/editor/Editor.svelte` (record snapshots; intercept keys; restore + persist)
- Modify: `docs/guia-de-uso.md`
- Modify: `e2e/` critical flow (extend existing Playwright suite)

**Interfaces:**
- Produces (`history.ts`):
  - `createHistory({ limit = 100 })` → `{ push(snapshot), undo(current), redo(current), canUndo(), canRedo(), reset() }`. A snapshot = `{ blocks, focusId, caretOffset }`. `undo(current)` pushes `current` to the redo stack and returns the previous snapshot (or null); `redo(current)` mirrors it. Any `push` clears the redo stack.
  - `diffBlocks(prev, next)` → `{ created: [...], updated: [...], deletedIds: [...] }` by block `id`, comparing the two block arrays so the caller can persist a restore through the storage layer.

- [ ] **Step 1: Write failing tests for the pure history**

```js
// src/lib/editor/history.test.ts
import { expect, it, describe } from 'vitest';
import { createHistory, diffBlocks } from './history';

describe('createHistory', () => {
	it('undo returns the previous snapshot and redo replays it', () => {
		const h = createHistory({ limit: 10 });
		h.push({ blocks: [{ id: 'a', content: '1' }], focusId: 'a', caretOffset: 1 });
		const current = { blocks: [{ id: 'a', content: '12' }], focusId: 'a', caretOffset: 2 };
		const prev = h.undo(current);
		expect(prev.blocks[0].content).toBe('1');
		const back = h.redo(prev);
		expect(back.blocks[0].content).toBe('12');
	});
	it('a new push clears the redo stack', () => {
		const h = createHistory({ limit: 10 });
		h.push({ blocks: [{ id: 'a', content: '1' }], focusId: 'a', caretOffset: 1 });
		h.undo({ blocks: [{ id: 'a', content: '2' }], focusId: 'a', caretOffset: 1 });
		h.push({ blocks: [{ id: 'a', content: '3' }], focusId: 'a', caretOffset: 1 });
		expect(h.canRedo()).toBe(false);
	});
	it('caps history at the limit', () => {
		const h = createHistory({ limit: 2 });
		for (let i = 0; i < 5; i++) h.push({ blocks: [{ id: 'a', content: String(i) }], focusId: 'a', caretOffset: 0 });
		// only the last 2 remain undoable
		h.undo({ blocks: [{ id: 'a', content: 'now' }], focusId: 'a', caretOffset: 0 });
		const second = h.undo({ blocks: [], focusId: 'a', caretOffset: 0 });
		expect(h.canUndo()).toBe(false);
		expect(second).not.toBeNull();
	});
});

describe('diffBlocks', () => {
	it('detects created, updated and deleted by id', () => {
		const prev = [{ id: 'a', content: '1' }, { id: 'b', content: 'x' }];
		const next = [{ id: 'a', content: '2' }, { id: 'c', content: 'new' }];
		const d = diffBlocks(prev, next);
		expect(d.deletedIds).toEqual(['b']);
		expect(d.created.map((x) => x.id)).toEqual(['c']);
		expect(d.updated.map((x) => x.id)).toEqual(['a']);
	});
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test:unit -- --run src/lib/editor/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `history.ts`**

```js
// src/lib/editor/history.ts
// Snapshot-based undo/redo for one note (spec 019, fix 6). Pure: the caller
// snapshots via $state.snapshot before mutating, and persists diffs on restore.
// Chosen over an operation log for the MVP; swappable later for sync/MCP.

export function createHistory({ limit = 100 } = {}) {
	let undoStack = [];
	let redoStack = [];
	return {
		push(snapshot) {
			undoStack.push(snapshot);
			if (undoStack.length > limit) undoStack.shift();
			redoStack = [];
		},
		undo(current) {
			if (undoStack.length === 0) return null;
			redoStack.push(current);
			return undoStack.pop();
		},
		redo(current) {
			if (redoStack.length === 0) return null;
			undoStack.push(current);
			return redoStack.pop();
		},
		canUndo: () => undoStack.length > 0,
		canRedo: () => redoStack.length > 0,
		reset() {
			undoStack = [];
			redoStack = [];
		}
	};
}

// Compare two block arrays by id so a restore can be persisted through storage.
export function diffBlocks(prev, next) {
	const prevById = new Map(prev.map((b) => [b.id, b]));
	const nextById = new Map(next.map((b) => [b.id, b]));
	const created = next.filter((b) => !prevById.has(b.id));
	const deletedIds = prev.filter((b) => !nextById.has(b.id)).map((b) => b.id);
	const updated = next.filter((b) => {
		const before = prevById.get(b.id);
		return before && JSON.stringify(before) !== JSON.stringify(b);
	});
	return { created, updated, deletedIds };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test:unit -- --run src/lib/editor/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire history into `Editor.svelte` — record**

Create the history per note. Because the note reloads via `noteId` effect, `reset()` there:

```js
import { createHistory, diffBlocks } from './history';
const history = createHistory({ limit: 100 });
```

In the note-load effect (~129-146) call `history.reset()` after `blocks` is set.

Add a `recordSnapshot()` that captures the current state before a mutation:

```js
function currentSnapshot() {
	const sel = window.getSelection();
	const caretOffset = sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : 0;
	return { blocks: $state.snapshot(blocks), focusId: activeBlockId, caretOffset };
}
function recordSnapshot() { history.push(currentSnapshot()); }
```

Call `recordSnapshot()` at the START of each mutating handler: `handleEnter`, `handleBackspaceEmpty`, `handleIndent`, `handleOutdent`, `handleMoveUp`, `handleMoveDown`, `handleToggleCollapsed`, `handleToggleChecked`, `deleteSelection`, `moveSelectedBlocks`, `insertSnippetBlocks`, `handlePasteLines`, and — debounced — text edits. For text, record once per burst: in `handleBlockInput`/`handleNoteInput`, record a snapshot only if the last record was >600ms ago or the previous keystroke targeted a different block (track `lastRecordAt`, `lastRecordBlockId`).

- [ ] **Step 6: Wire history into `Editor.svelte` — restore + keys**

Add a restore that applies a snapshot to `blocks` and persists the diff:

```js
async function restore(snapshot) {
	if (!snapshot) return;
	const diff = diffBlocks($state.snapshot(blocks), snapshot.blocks);
	blocks = snapshot.blocks.map((b) => ({ ...b }));
	for (const id of diff.deletedIds) await softDeleteBlock(id);
	for (const b of diff.created) await createBlock(b); // createBlock must accept a full row w/ id
	for (const b of diff.updated) { const { id, ...changes } = b; await updateBlock(id, changes); }
	focusBlockId = snapshot.focusId ?? (blocks[0] && blocks[0].id);
}
```

Confirm `createBlock` can re-create a soft-deleted/removed block with its original id; if not, add a storage helper `restoreBlock(row)` that upserts by id and clears `deletedAt`. Then intercept keys in the capture handler (`handleSelectionKeys` already runs on `onkeydowncapture` at the container ~653) OR add to the same handler:

```js
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
	event.preventDefault();
	event.stopPropagation();
	if (event.shiftKey) restore(history.redo(currentSnapshot()));
	else restore(history.undo(currentSnapshot()));
	return;
}
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
	event.preventDefault();
	event.stopPropagation();
	restore(history.redo(currentSnapshot()));
	return;
}
```

Place this at the TOP of `handleSelectionKeys` so it wins regardless of selection state. Flush any pending debounced text save (`flushPending()`) before restoring so storage and snapshot agree.

- [ ] **Step 7: Manual check**

`pnpm dev`: type a sentence, indent a block, delete a block, toggle a todo — press Ctrl+Z repeatedly and watch each action reverse in order; Ctrl+Shift+Z replays. Reload after an undo → the persisted state matches what you saw. Switch notes → history resets (undo does nothing on the fresh note). Confirm text undo rewinds a burst, not per key.

- [ ] **Step 8: Playwright critical flow**

Extend the existing e2e suite: create nested blocks, delete one, press Ctrl+Z, reload, assert the block is back. Run: `pnpm test:e2e`.

- [ ] **Step 9: Guide + commit**

Guide (atajos): "Ctrl/Cmd+Z deshace lo último (escribir, borrar, mover, indentar, tildar…); Ctrl/Cmd+Shift+Z (o Ctrl+Y) rehace. El historial es por nota." Bump date.

```bash
git add src/lib/editor/history.ts src/lib/editor/history.test.ts src/lib/editor/Editor.svelte docs/guia-de-uso.md e2e
git commit -m "feat: 019 fix 6 — app-wide undo/redo"
```

---

## Self-Review

**Spec coverage:** Fix 1→Task 1, Fix 2→Task 2, Fix 3→Task 3, Fix 4→Task 4, Fix 5→Task 5, Fix 6→Task 6. Out-of-scope #4 (cross-line char selection) intentionally absent. Guide-update step present in every task per project rule. Minimum tests from the spec are covered: paste parser (T5), history snapshot/diff (T6), copy formatters with `\n` (T4), delete-note component (T1), soft-break component behavior (T4 manual + copy tests), Playwright paste/undo (T6). Gap accepted: a dedicated Testing-Library test for Shift+Enter is folded into T4 manual + format tests to avoid brittle contenteditable/execCommand tests in jsdom; note this in the T4 commit if a component test proves feasible.

**Placeholder scan:** No TBD/TODO. DOM-bound steps (T3, T6 restore) carry explicit caveats where a runtime check is required (`createBlock` accepting ids; focus-effect interaction) rather than vague "handle edge cases".

**Type consistency:** `parsePastedLines` shape `{type,content,checked?}` used identically in T5 parser and Editor insert. `createHistory`/`diffBlocks` signatures match between T6 test, module, and Editor wiring. `onVerticalArrow`, `onPasteLines`, `onDeleteNote`, `initialQuery` prop names consistent across BlockRow/Editor/NoteSidebar/SearchDialog and their `+page` wiring.

**Known runtime-verification points (flagged, not placeholders):** (a) `document.caretPositionFromPoint` support/return in target browsers — code has the `caretRangeFromPoint` fallback; (b) `createBlock` re-creating a block with its original id for undo — T6 Step 6 says add `restoreBlock` if needed; (c) `execCommand('insertLineBreak')` availability — T4 notes the manual range fallback. Each is to be confirmed during that task, not deferred silently.
