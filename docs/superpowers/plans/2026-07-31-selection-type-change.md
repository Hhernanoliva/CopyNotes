# Cambiar el tipo de varios renglones con "/" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With several rows selected in the editor, pressing `/` opens the existing slash menu applied to the whole group, so a pasted list of bullets becomes tasks in one gesture.

**Architecture:** A new pure planner (`planTypeChangeSelection`) in `src/lib/blocks/selection.ts` computes the per-row field changes and is unit-tested without the editor. `Editor.svelte` gets a small state (`selectionMenu`) that is **separate** from the typed-`/` state (`slash`), a branch in `handleSelectionKeys` for `/` plus the menu's own keys, and an apply function that routes `todo` rows through `convertToTask` (the single door that writes the agent's `created` line) and every other type through `updateBlock`. Rendering reuses `SlashMenu.svelte` unchanged except for one optional `title` prop.

**Tech Stack:** SvelteKit + Svelte 5 runes, plain JavaScript inside `.ts`/`.svelte` (no type annotations), Vitest for unit tests, Playwright for e2e, pnpm.

## Global Constraints

- Spec: `specs/031-selection-type-change.md`. Read it before starting. `AGENT.md` is the source of truth for the quality bar.
- **Plain JavaScript style** in hand-written code: no TypeScript annotations, even inside `.ts` files.
- **Every key that must act on the group needs its own branch in `handleSelectionKeys`.** A key without a branch falls through to the focused row and silently acts on one block (the bug that made `Tab` indent only the first selected row, fixed 2026-07-31).
- **`convertToTask` is the single door for task creation.** Never write `type: 'todo'` through `updateBlock` directly — the agent's journal would lose its `created` lines.
- **Never do length arithmetic on `block.content`** (a visually empty row stores a phantom `"\n"` from the browser's `<br>`).
- **Never touch the typed-`/` flow**: `nextSlashState`, `detectTrigger`, `strippedSlashFields` and the `slash` state stay as they are.
- **Guide rule:** every user-visible behavior is documented in `docs/guia/` **in the same commit** that implements it, in plain Spanish, no jargon. Update the "Última actualización" date in `docs/guia-de-uso.md`.
- **Commits carry no agent traces**: no `Co-Authored-By`, no "Generated with", no emoji footer. Commit messages in Spanish, Conventional Commits style, matching the existing log.
- Commit as you go — one commit per task, never batch two tasks into one.

---

### Task 1: The pure planner `planTypeChangeSelection`

**Files:**
- Modify: `src/lib/blocks/selection.ts` (append at the end of the file)
- Modify: `src/lib/blocks/selection.test.ts` (imports at the top + a new `describe` at the end)

**Interfaces:**
- Consumes: `planBlockType(block, nextType)` from `$lib/format/blocktype` — returns `{ type, checked }`; headings always get `checked: false`, every other type keeps `block.checked ?? false`. `plainTextToHtml(text)` from `$lib/format/sanitize` — escapes plain text into safe HTML.
- Produces: `planTypeChangeSelection(blocks, selectedIds, type)` → `{ updates: [{ id, type, checked, html? }] }` in visible order, or `null` when nothing is convertible. Task 2 imports it from `$lib/blocks/selection`.

- [ ] **Step 1: Write the failing tests**

Add these imports to the existing import block at the top of `src/lib/blocks/selection.test.ts` (keep the ones already there):

```js
import {
	selectionRange,
	neighborVisibleId,
	orderedSelectionRoots,
	planDeleteSelection,
	planMoveSelection,
	planIndentSelection,
	planOutdentSelection,
	planTypeChangeSelection
} from './selection';
```

Append at the end of the file:

```js
// Type change over a selection (spec 031). The tree helper `b` above builds
// blocks with only the hierarchy fields, so these cases pass the extra fields
// (type, content, checked) explicitly.
describe('planTypeChangeSelection', () => {
	const rows = [
		b('a', null, 0, { type: 'bullet', content: 'uno', checked: false }),
		b('sep', null, 1, { type: 'separator', content: '' }),
		b('c', null, 2, { type: 'todo', content: 'tres', checked: true }),
		b('d', null, 3, { type: 'text', content: 'cuatro <b>', checked: false })
	];

	it('converts text and bullet rows into unticked tasks', () => {
		const plan = planTypeChangeSelection(rows, ['a', 'd'], 'todo');
		expect(plan.updates).toEqual([
			{ id: 'a', type: 'todo', checked: false },
			{ id: 'd', type: 'todo', checked: false }
		]);
	});

	it('keeps the tick of a row that was already a task', () => {
		const plan = planTypeChangeSelection(rows, ['c'], 'todo');
		expect(plan.updates).toEqual([{ id: 'c', type: 'todo', checked: true }]);
	});

	it('skips separators inside the selection', () => {
		const plan = planTypeChangeSelection(rows, ['a', 'sep', 'c'], 'todo');
		expect(plan.updates.map((update) => update.id)).toEqual(['a', 'c']);
	});

	it('returns the updates in visible order, whatever order the ids come in', () => {
		const plan = planTypeChangeSelection(rows, ['d', 'a'], 'bullet');
		expect(plan.updates.map((update) => update.id)).toEqual(['a', 'd']);
	});

	it('plans only the selected rows, never their unselected children', () => {
		const plan = planTypeChangeSelection(tree, ['b'], 'todo');
		expect(plan.updates.map((update) => update.id)).toEqual(['b']);
	});

	it('drops the tick when the target type is a heading', () => {
		const plan = planTypeChangeSelection(rows, ['c'], 'heading2');
		expect(plan.updates).toEqual([{ id: 'c', type: 'heading2', checked: false }]);
	});

	it('escapes the text into html when converting to code', () => {
		const plan = planTypeChangeSelection(rows, ['d'], 'code');
		expect(plan.updates).toEqual([
			{ id: 'd', type: 'code', checked: false, html: 'cuatro &lt;b&gt;' }
		]);
	});

	it('returns null when nothing in the selection is convertible', () => {
		expect(planTypeChangeSelection(rows, ['sep'], 'todo')).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/blocks/selection.test.ts`
Expected: FAIL — `planTypeChangeSelection is not a function` (or an import error).

- [ ] **Step 3: Write the implementation**

Add these imports at the top of `src/lib/blocks/selection.ts`, under the existing ones:

```js
import { planBlockType } from '$lib/format/blocktype';
import { plainTextToHtml } from '$lib/format/sanitize';
```

Append at the end of `src/lib/blocks/selection.ts`:

```js
// Change the type of every selected row at once (spec 031: "/" over a
// selection). Separators are skipped — converting one would throw away the
// divider for no text gain. Only the selected ids are planned: unlike delete,
// a type change cannot orphan a child, so "what you see marked is what
// changes" and a collapsed parent converts alone. Null when nothing is
// convertible, so the caller can no-op without recording an undo step.
export function planTypeChangeSelection(blocks, selectedIds, type) {
	const set = new Set(selectedIds);
	const updates = [];
	for (const id of visibleIds(blocks)) {
		if (!set.has(id)) continue;
		const block = blocks.find((row) => row.id === id);
		if (!block || block.type === 'separator') continue;
		const changes = planBlockType(block, type);
		// A code row renders its content as plain text, so its html must not keep
		// the old rich markup. Escaped, never raw: block.html is an innerHTML sink.
		if (type === 'code') changes.html = plainTextToHtml(block.content ?? '');
		updates.push({ id, ...changes });
	}
	return updates.length ? { updates } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/blocks/selection.test.ts`
Expected: PASS, all cases green, including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/selection.ts src/lib/blocks/selection.test.ts
git commit -m "feat(selección): planificador puro para cambiar el tipo de varios renglones"
```

---

### Task 2: The `/` gesture over a selection

**Files:**
- Modify: `src/lib/editor/SlashMenu.svelte` (new optional `title` prop + its header)
- Modify: `src/lib/editor/BlockRow.svelte` (new optional `slashTitle` prop, passed through)
- Modify: `src/lib/editor/Editor.svelte` (imports, `selectionMenu` state, derived menu wiring, `handleSelectionKeys` branches, `applySelectionType`, the `<BlockRow>` props)
- Test: `e2e/slash.spec.ts` (new test appended at the end)
- Docs: `docs/guia/06-seleccionar-deshacer-colapsar.md`, `docs/guia/02-notas-y-tipos-de-renglon.md`, `docs/guia-de-uso.md`

**Interfaces:**
- Consumes: `planTypeChangeSelection(blocks, selectedIds, type)` from Task 1 (`$lib/blocks/selection`); `SLASH_COMMANDS` and `moveSelection(index, delta, length)` from `./slash`; `convertToTask({ blockId, checked })` from `$lib/tasks`; the editor's own `selectedIds`, `hasSelection`, `selection`, `recordSnapshot()`, `updateBlock`, `focusBlockId`, `claim(event)`.
- Produces: nothing other tasks depend on — this is the last task.

- [ ] **Step 1: Write the failing e2e test**

Append at the end of `e2e/slash.spec.ts`:

```js
// Spec 031: with several rows marked, "/" changes the type of the whole group.
// The pasted-bullets case: three bullets become three tasks in one gesture.
// Keyboard path: the group menu lists text, h1, h2, h3, bullet, todo, code —
// so "Tarea" is five ArrowDowns down from the top.
test('"/" over a selection converts every marked row into a task', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/vineta');
	await page.keyboard.press('Enter');
	await page.keyboard.type('uno');
	await page.keyboard.press('Enter');
	await page.keyboard.type('dos');
	await page.keyboard.press('Enter');
	await page.keyboard.type('tres');

	// Mark the three rows from the last one upwards.
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('Shift+ArrowUp');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeHidden();
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await expect(menu).toContainText('3 renglones');

	for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(3);

	// The "/" never entered any row's text.
	const rows = page.locator('main [data-block-id] .block-editable');
	await expect(rows.nth(0)).toHaveText('uno');
	await expect(rows.nth(1)).toHaveText('dos');
	await expect(rows.nth(2)).toHaveText('tres');
});

// Mouse path + Escape + undo. Pressing "/" again is the probe for "the
// selection is still marked": the group menu only opens with 2+ rows selected.
test('picking with the mouse keeps the selection, and one Ctrl+Z undoes the group', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('uno');
	await page.keyboard.press('Enter');
	await page.keyboard.type('dos');
	await page.keyboard.press('Shift+ArrowUp');

	const menu = page.locator('#slash-menu');
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(0);

	// The selection survived Escape: the group menu opens again.
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.getByRole('option', { name: 'Tarea' }).click();
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(2);

	// …and it also survived the click on the menu option.
	await page.keyboard.press('/');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');

	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('main [role="checkbox"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `pnpm exec playwright test e2e/slash.spec.ts -g "over a selection"`
Expected: FAIL — the menu never opens (`#slash-menu` stays hidden) because `/` still falls through to plain typing.

- [ ] **Step 3: Add the optional title to `SlashMenu.svelte`**

Change the props line (currently `let { commands, selectedIndex, onSelect, emptyLabel = 'Sin resultados' } = $props();`) to:

```js
	let { commands, selectedIndex, onSelect, emptyLabel = 'Sin resultados', title = '' } = $props();
```

In the `<div role="listbox" …>`, change the `aria-label` line to:

```svelte
	aria-label={title || (isSnippets ? 'Snippets guardados' : 'Tipos de bloque')}
```

And add this line to the same `<div role="listbox" …>`, next to `use:keyboardInset`:

```svelte
	onpointerdown={(event) => event.stopPropagation()}
```

**Why it is required, not cosmetic:** the menu is rendered inside the row, and
the row's own `onpointerdown` arms the drag-to-reorder controller. When the
press lands on a row that is already selected, a release without movement is
read as "plain click on the selection" and calls `onSelectionClick` →
`clearSelection()`. Without this line, clicking an option applies the type and
then drops the selection (and the focus never returns, because `selection` is
already null by then). The date badge at `BlockRow.svelte:813` guards itself the
same way. `tapSelect`'s own `preventDefault` on `pointerdown` stays as it is —
it is what keeps the caret in the row; it does not stop propagation.

And add the header as the first child inside that `<div>`, right before `{#if commands.length === 0}`:

```svelte
	<!-- Solo lo usa el menú de grupo (spec 031). Oculto abajo de 768px: ahí el
	     menú es una barra horizontal y un título la desarmaría — y la selección
	     de varios renglones es gesto de mouse/teclado, no de celular. -->
	{#if title}
		<p class="text-muted-foreground border-border mb-1 border-b px-2 py-1 text-xs max-md:hidden">
			{title}
		</p>
	{/if}
```

- [ ] **Step 4: Pass the title through `BlockRow.svelte`**

In the props block, next to the other slash props (`slashEmptyLabel = 'Sin resultados',`), add:

```js
		slashTitle = '',
```

And in the `{#if slashOpen}` render at the bottom, add the prop:

```svelte
	{#if slashOpen}
		<SlashMenu
			commands={slashCommands}
			selectedIndex={slashIndex}
			onSelect={onSlashSelect}
			emptyLabel={slashEmptyLabel}
			title={slashTitle}
		/>
	{/if}
```

- [ ] **Step 5: Wire the state and the keys in `Editor.svelte`**

5a. Extend the two existing imports:

```js
	import {
		selectionRange,
		neighborVisibleId,
		orderedSelectionRoots,
		planDeleteSelection,
		planMoveSelection,
		planIndentSelection,
		planOutdentSelection,
		planTypeChangeSelection
	} from '$lib/blocks/selection';
```

```js
	import { SLASH_COMMANDS, filterCommands, moveSelection, nextSlashState } from './slash';
```

5b. Right after the `hasSelection` derived (`const hasSelection = $derived(selectedIds.length > 1);`), add the state and the command list:

```js
	// El menú de grupo (spec 031): "/" con varios renglones marcados. Estado
	// aparte del "/" tipeado en un renglón — ahí el carácter vive dentro del
	// texto hasta confirmar, y acá nunca entra en ningún renglón.
	let selectionMenu = $state(null); // { index }
	// Solo cambios de tipo: Fecha abriría un panel por renglón, Separador
	// borraría el texto de todos y Snippet no es un tipo.
	const SELECTION_TYPE_IDS = ['text', 'heading1', 'heading2', 'heading3', 'bullet', 'todo', 'code'];
	const SELECTION_TYPE_COMMANDS = SLASH_COMMANDS.filter((command) =>
		SELECTION_TYPE_IDS.includes(command.id)
	);
```

5c. Add the apply function right after `indentSelectedBlocks` (before `moveSelectedBlocks`):

```js
	// Aplica un tipo a todo el grupo marcado. Las tareas nacen por convertToTask
	// (deja la línea 'created' que lee el agente); el resto va por updateBlock.
	// Un solo recordSnapshot: un Ctrl/Cmd+Z deshace la conversión entera.
	async function applySelectionType(type) {
		const plan = planTypeChangeSelection(blocks, selectedIds, type);
		selectionMenu = null;
		if (!plan) return;
		recordSnapshot();
		for (const update of plan.updates) {
			const { id, ...changes } = update;
			const row = blocks.find((block) => block.id === id);
			if (row) Object.assign(row, changes);
			if (changes.type === 'todo') await convertToTask({ blockId: id, checked: changes.checked });
			else await updateBlock(id, changes);
		}
		// La selección sigue marcada: el siguiente Tab / Alt+↓ / Cmd+C actúa
		// sobre el mismo grupo, así que hay que devolverle el foco.
		if (selection) focusBlockId = selection.focusId;
	}
```

5d. In `handleSelectionKeys`, insert this block **immediately after** the line `if (!hasSelection) return;` and **before** the `Cmd/Ctrl+C` branch:

```js
		// Menú de grupo abierto: se queda con sus teclas antes que cualquier otra
		// rama, o Tab anidaría y Escape soltaría la selección con el menú abierto.
		if (selectionMenu) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				claim(event);
				const next = moveSelection(
					selectionMenu.index,
					event.key === 'ArrowDown' ? 1 : -1,
					SELECTION_TYPE_COMMANDS.length
				);
				selectionMenu = { index: next };
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				claim(event);
				applySelectionType(SELECTION_TYPE_COMMANDS[selectionMenu.index].id);
				return;
			}
			if (event.key === 'Escape') {
				claim(event);
				selectionMenu = null;
				focusBlockId = selection.focusId;
				return;
			}
			// Cualquier otra tecla cierra el menú y sigue su curso normal.
			selectionMenu = null;
		}
		// "/" con varios renglones marcados abre el menú para todo el grupo. El
		// carácter no entra en ningún renglón: la tecla se consume acá.
		if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
			claim(event);
			selectionMenu = { index: 0 };
			return;
		}
```

5e. Clear the menu wherever the selection dies. In `clearSelection()`:

```js
	function clearSelection() {
		selection = null;
		selectionMenu = null;
	}
```

5f. Feed `BlockRow` from either menu. Replace the three slash props in the `<BlockRow …>` call:

```svelte
					slashOpen={selectionMenu
						? selection?.focusId === row.block.id
						: slash !== null && slash.blockId === row.block.id}
					slashCommands={selectionMenu ? SELECTION_TYPE_COMMANDS : slashCommands}
					slashIndex={selectionMenu ? selectionMenu.index : slash ? slash.index : 0}
					slashTitle={selectionMenu ? `Convertir ${selectedIds.length} renglones en…` : ''}
```

and replace the `onSlashSelect` prop (currently `onSlashSelect={applySlashCommand}`):

```svelte
					onSlashSelect={(command) =>
						selectionMenu ? applySelectionType(command.id) : applySlashCommand(command)}
```

- [ ] **Step 6: Run the e2e tests to verify they pass**

Run: `pnpm exec playwright test e2e/slash.spec.ts`
Expected: PASS — the two new tests plus every pre-existing test in the file (the typed-`/` flow must be untouched).

- [ ] **Step 7: Run the full checks**

Run, in order:

```bash
pnpm vitest run
pnpm check
pnpm exec playwright test
```

Expected: unit suite green, `pnpm check` with no **new** errors (note the pre-existing count before you start, so you can prove you added none), e2e suite green.

If an e2e test outside `slash.spec.ts` fails, do not dismiss it as flaky: reproduce it on a clean checkout of `main` first, and only then decide.

- [ ] **Step 8: Write the guide (same commit as the code)**

In `docs/guia/06-seleccionar-deshacer-colapsar.md`, inside the bullet list under "## Seleccionar varios renglones", add this item right after the "**Mover** el grupo" bullet:

```markdown
- **Convertir el grupo a otro tipo:** apretá **`/`** con los renglones marcados. Se abre el mismo menú de siempre, pero arriba dice "Convertir 5 renglones en…" y lo que elijas se aplica a todos: Texto, Título, Viñeta, **Tarea** o Código. Es la forma rápida de pasar a tareas una lista de viñetas que pegaste de otro lado. Los separadores que estén en el medio no se tocan. Si alguno ya era una tarea tildada, se queda tildado. **Escape** cierra el menú sin cambiar nada. Un solo **Ctrl/Cmd+Z** deshace la conversión entera.
```

In `docs/guia/02-notas-y-tipos-de-renglon.md`, at the end of the section that explains how to cambiar el tipo de un renglón, add:

```markdown
¿Tenés que cambiar varios renglones de una? Marcalos y apretá **`/`**: el menú se aplica a todo el grupo. Está explicado en [Seleccionar, deshacer y colapsar](06-seleccionar-deshacer-colapsar.md).
```

In `docs/guia-de-uso.md`, update the "Última actualización" date to today.

- [ ] **Step 9: Commit**

```bash
git add src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte src/lib/editor/SlashMenu.svelte e2e/slash.spec.ts docs/guia/06-seleccionar-deshacer-colapsar.md docs/guia/02-notas-y-tipos-de-renglon.md docs/guia-de-uso.md
git commit -m "feat(selección): \"/\" cambia el tipo de todos los renglones marcados"
```

- [ ] **Step 10: Check it by hand in the real app**

Run `pnpm dev`, open a note, paste or type three bullets, mark them with `Shift+↑`, press `/`, choose **Tarea**. Confirm: three checkboxes, no `/` left in any row, the rows stay marked, one `Ctrl/Cmd+Z` puts the bullets back, and the tasks show up in the Agenda / for the agent as newly created.
